import type { Socket } from "socket.io";

export interface User {
  socket: Socket;
  name: string;
  language: string;
  industry: string;
  skillBucket: string; // e.g., "b", "i", "a" or band "100-200"
}
