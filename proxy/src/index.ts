import express, { Request, Response } from "express";
import http from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

// ENV
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const INTERNAL_BACKEND_URL = process.env.INTERNAL_BACKEND_URL || "http://localhost:5000";

// Create Express app
const app = express();

// Health
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Proxy HTTP API to backend (REST endpoints)
app.use("/api", createProxyMiddleware({
  target: INTERNAL_BACKEND_URL,
  changeOrigin: true,
  ws: true,
}));

// Proxy Socket.IO path (default /socket.io/) to backend, including WS upgrade
const wsProxy = createProxyMiddleware({
  target: INTERNAL_BACKEND_URL,
  changeOrigin: true,
  ws: true,
});

// Mount at root so initial HTTP handshake or socket transport requests get proxied
app.use(wsProxy);

// Server + WebSocket upgrade hook
const server = http.createServer(app);
server.on("upgrade", wsProxy.upgrade);

server.listen(PORT, () => {
  console.log(`Proxy listening on :${PORT}, proxying to ${INTERNAL_BACKEND_URL}`);
});
