import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";

import { UserManager } from "./managers/UserManger"; // <- fix the typo if needed
import { pubClient, subClient } from "./cache/redis";
import { presenceUp, presenceHeartbeat, presenceDown, countOnline } from "./cache/presence";

// OPTIONAL: scale Socket.IO across processes/containers
// npm i @socket.io/redis-adapter
import { createAdapter } from "@socket.io/redis-adapter";

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*" } });

// Enable Redis adapter (comment out if single instance)
io.adapter(createAdapter(pubClient, subClient));

const userManager = new UserManager();

// Health endpoint (quick visibility)
app.get("/healthz", async (_req, res) => {
  try {
    const online = await countOnline().catch(() => -1);
    res.json({ ok: true, online });
  } catch {
    res.json({ ok: true, online: -1 });
  }
});

const HEARTBEAT_MS = Number(process.env.SOCKET_HEARTBEAT_MS || 30_000);
const heartbeats = new Map<string, ReturnType<typeof setInterval>>();

io.on("connection", (socket: Socket) => {
  console.log(`[io] connected ${socket.id}`);

  // derive some meta (feel free to add role/skills etc.)
  const meta = {
    name: (socket.handshake.auth?.name as string) || "guest",
    ip: socket.handshake.address || null,
    ua: socket.handshake.headers["user-agent"] || null,
  };

  // Store in cache
  presenceUp(socket.id, meta).catch((e) => console.warn("[presenceUp]", e.message));

  // Refresh TTL while connected
  const hb = setInterval(() => {
    presenceHeartbeat(socket.id).catch((e) => console.warn("[presenceHeartbeat]", e.message));
  }, HEARTBEAT_MS);
  heartbeats.set(socket.id, hb);

  // Your existing user manager
  userManager.addUser(meta.name, socket);

  socket.on("disconnect", (reason) => {
    console.log(`[io] disconnected ${socket.id} (${reason})`);
    clearInterval(heartbeats.get(socket.id));
    heartbeats.delete(socket.id);

    // Remove from cache
    presenceDown(socket.id).catch((e) => console.warn("[presenceDown]", e.message));

    userManager.removeUser(socket.id);
  });

  socket.on("error", (err) => console.warn(`[io] socket error ${socket.id}:`, err));
});

// Use the port provided by env (Render/Heroku/etc.)
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`listening on *:${PORT}`));
