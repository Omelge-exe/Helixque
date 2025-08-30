import type { Redis } from "ioredis";

type UserMeta = {
  id: string; // socket.id
  language: string;
  industry: string;
  skillBucket: string;
};

export class Matchmaker {
  constructor(private redis: Redis) {}

  private shardKey(meta: UserMeta) {
    return `Q:${meta.language}:${meta.industry}:${meta.skillBucket}`;
  }
  private langKey(lang: string) { return `QL:${lang}`; }
  private indKey(ind: string) { return `QI:${ind}`; }
  private globalKey() { return `QG`; }

  // Presence, partner, bans
  private onlineKey() { return `online`; } // HASH socketId -> "1"
  private partnerOfKey() { return `partnerOf`; } // HASH socketId -> partnerId
  private roomOfKey() { return `roomOf`; } // HASH socketId -> roomId
  private banKey(id: string) { return `ban:${id}`; } // SET of banned partner ids

  async setOnline(id: string) {
    await this.redis.hset(this.onlineKey(), id, "1");
  }
  async setOffline(id: string) {
    await this.redis.hdel(this.onlineKey(), id);
  }
  async isOnline(id: string) {
    return (await this.redis.hexists(this.onlineKey(), id)) === 1;
  }

  async setPartners(a: string, b: string) {
    await this.redis.hset(this.partnerOfKey(), a, b);
    await this.redis.hset(this.partnerOfKey(), b, a);
  }
  async getPartner(id: string) {
    return this.redis.hget(this.partnerOfKey(), id);
  }
  async clearPartners(a: string, b?: string) {
    await this.redis.hdel(this.partnerOfKey(), a);
    if (b) await this.redis.hdel(this.partnerOfKey(), b);
  }

  async setRoom(id: string, roomId: string) {
    await this.redis.hset(this.roomOfKey(), id, roomId);
  }
  async getRoom(id: string) {
    return this.redis.hget(this.roomOfKey(), id);
  }
  async clearRoom(a: string, b?: string) {
    await this.redis.hdel(this.roomOfKey(), a);
    if (b) await this.redis.hdel(this.roomOfKey(), b);
  }

  async banEachOther(a: string, b: string) {
    await this.redis.sadd(this.banKey(a), b);
    await this.redis.sadd(this.banKey(b), a);
  }
  private async isBanned(a: string, b: string) {
    const result = await this.redis
      .multi()
      .sismember(this.banKey(a), b)
      .sismember(this.banKey(b), a)
      .exec();
    const [ab, ba] = result ?? [[null, 0], [null, 0]];
    const abv = Number(ab?.[1] ?? 0), bav = Number(ba?.[1] ?? 0);
    return abv === 1 || bav === 1;
  }

  // Enqueue user; attempt fast match with bounded fallbacks
  async enqueue(meta: UserMeta): Promise<string | null> {
    const primary = this.shardKey(meta);
    const fallbacks: string[] = [
      primary,
      this.langKey(meta.language),
      this.indKey(meta.industry),
      this.globalKey(),
    ];

    // Try to find a partner: bounded probes, lazy-skip offline/banned
    for (const key of fallbacks) {
      // Pop until we either match or the queue yields nothing viable
      while (true) {
        const candidate = await this.redis.rpop(key);
        if (!candidate) break;
        const online = await this.isOnline(candidate);
        if (!online) continue; // lazy skip
        const banned = await this.isBanned(meta.id, candidate);
        if (banned) continue;
        // Found a partner
        return candidate;
      }
    }

    // No partner found; push to queues (primary + light secondary)
    await this.redis.lpush(primary, meta.id);
    await this.redis.lpush(this.langKey(meta.language), meta.id);
    await this.redis.lpush(this.indKey(meta.industry), meta.id);
    await this.redis.lpush(this.globalKey(), meta.id);
    return null;
  }

  async requeue(id: string, meta: UserMeta) {
    // Simple requeue to primary for immediate rematch attempt by caller
    await this.redis.lpush(this.shardKey(meta), id);
  }
}
