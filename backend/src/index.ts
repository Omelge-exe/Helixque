import { Socket } from "socket.io";
import http from "http";

import express from 'express';
import { Server } from 'socket.io';
import { UserManager } from "./managers/UserManger";

const app = express();
// FIX: Pass express app to createServer, NOT http module
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const userManager = new UserManager();

io.on('connection', (socket: Socket) => {
  console.log('a user connected');
  userManager.addUser("randomName", socket);
  socket.on("disconnect", () => {
    console.log("user disconnected");
    userManager.removeUser(socket.id);
  });
});

// Use the port provided by environment variable PORT (Render injects this automatically)
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
