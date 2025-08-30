import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const appRedis = new Redis(REDIS_URL);
export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

// Helpful logs (won’t crash app)
for (const [name, c] of [["app", appRedis], ["pub", pubClient], ["sub", subClient]] as const) {
  c.on("connect", () => console.log(`[redis:${name}] connected`));
  c.on("error", (e) => console.warn(`[redis:${name}] error`, e.message));
}
