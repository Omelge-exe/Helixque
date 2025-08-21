import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";

import { UserManager } from "./managers/UserManger"; // keep your current path
// import { pubClient, subClient } from "./cache/redis";
// import { presenceUp, presenceHeartbeat, presenceDown, countOnline } from "./cache/presence";
// import { createAdapter } from "@socket.io/redis-adapter";

// ⬇️ NEW: import your chat wiring/util
import { wireChat, joinChatRoom } from "./chat/chat";

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*" } });
// io.adapter(createAdapter(pubClient, subClient));

const userManager = new UserManager();

// Health endpoint
app.get("/healthz", async (_req, res) => {
  try {
    // const online = await countOnline().catch(() => -1);
    // res.json({ ok: true, online });
    res.json({ ok: true, online: -1 }); // fallback without Redis
  } catch {
    res.json({ ok: true, online: -1 });
  }
});

const HEARTBEAT_MS = Number(process.env.SOCKET_HEARTBEAT_MS || 30_000);
const heartbeats = new Map<string, ReturnType<typeof setInterval>>();

io.on("connection", (socket: Socket) => {
  console.log(`[io] connected ${socket.id}`);

  // Derive meta
  const meta = {
    name: (socket.handshake.auth?.name as string) || "guest",
    ip: socket.handshake.address || null,
    ua: socket.handshake.headers["user-agent"] || null,
  };

  // Presence (disabled Redis for now)
  // presenceUp(socket.id, meta).catch((e) => console.warn("[presenceUp]", e.message));
  const hb = setInterval(() => {
    // presenceHeartbeat(socket.id).catch((e) => console.warn("[presenceHeartbeat]", e.message));
  }, HEARTBEAT_MS);
  heartbeats.set(socket.id, hb);

  // Track user
  userManager.addUser(meta.name, socket, meta);

  // ⬇️ Hook up chat listeners (chat:join, chat:message, chat:typing)
  wireChat(io, socket);

  // ⬇️ Auto-join a chat room if the client provided it (no matchmaking).
  //    Supports either `io(..., { auth: { roomId }})` or `?roomId=...`
  const roomFromAuth = (socket.handshake.auth?.roomId as string) || "";
  const roomFromQuery = (socket.handshake.query?.roomId as string) || "";
  const initialRoomId = (roomFromAuth || roomFromQuery || "").toString().trim();

  if (initialRoomId) {
    joinChatRoom(socket, initialRoomId, meta.name);
    userManager.setRoom(socket.id, initialRoomId);
  }

  // ⬇️ Keep UserManager in sync when client explicitly joins later
  socket.on("chat:join", ({ roomId }: { roomId: string; name?: string }) => {
    if (roomId) userManager.setRoom(socket.id, roomId);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[io] disconnected ${socket.id} (${reason})`);

    clearInterval(heartbeats.get(socket.id));
    heartbeats.delete(socket.id);

    // presence down (disabled Redis)
    // presenceDown(socket.id).catch((e) => console.warn("[presenceDown]", e.message));

    // Optional: announce "left" to current room (mirrors joinChatRoom)
    const u = userManager.getUser(socket.id);
    if (u?.roomId) {
      socket.nsp.in(`chat:${u.roomId}`).emit("chat:system", {
        text: `${u.name} left the chat`,
        ts: Date.now(),
      });
    }

    userManager.removeUser(socket.id);
  });

  socket.on("error", (err) => console.warn(`[io] socket error ${socket.id}:`, err));
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => console.log(`listening on *:${PORT}`));
