import { appRedis } from "./redis";

const TTL_SEC = Number(process.env.SOCKET_PRESENCE_TTL || 60);

// Key helpers
const K = {
  socketMeta: (sid: string) => `socket:${sid}`,      // string => JSON meta (name, ts, ip, etc)
  onlineSet:                 "sockets:online",       // Set of SIDs
};

// Add (on connection)
export async function presenceUp(socketId: string, meta: Record<string, any>) {
  const now = Date.now();
  const payload = JSON.stringify({ ...meta, ts: now });
  await appRedis
    .multi()
    .set(K.socketMeta(socketId), payload, "EX", TTL_SEC)
    .sadd(K.onlineSet, socketId)
    .exec();
}

// Heartbeat (refresh TTL)
export async function presenceHeartbeat(socketId: string) {
  // Only need to refresh expiry; keep value as-is
  // A portable way: get + set with EX if you need; cheaper: just expire
  await appRedis.expire(K.socketMeta(socketId), TTL_SEC);
}

// Remove (on disconnect)
export async function presenceDown(socketId: string) {
  await appRedis
    .multi()
    .del(K.socketMeta(socketId))
    .srem(K.onlineSet, socketId)
    .exec();
}

// Introspection (optional)
export async function getOnlineSockets(): Promise<string[]> {
  return appRedis.smembers(K.onlineSet);
}

export async function countOnline(): Promise<number> {
  return appRedis.scard(K.onlineSet);
}
