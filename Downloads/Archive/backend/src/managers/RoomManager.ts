import { User } from "./UserManger"; // keep your import name as-is

let GLOBAL_ROOM_ID = 1;

interface Room {
    user1: User,
    user2: User,
}

export class RoomManager {
    private rooms: Map<string, Room>;

    constructor() {
        this.rooms = new Map<string, Room>();
    }

    // Return roomId so caller can store mappings
    createRoom(user1: User, user2: User) {
        const roomId = this.generate().toString();
        this.rooms.set(roomId, { user1, user2 });

        // Your original behavior: ask both to start offer (you may choose only one in future)
        user1.socket.emit("send-offer", { roomId });
        user2.socket.emit("send-offer", { roomId });

        return roomId;
    }

    onOffer(roomId: string, sdp: string, senderSocketid: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const receivingUser = room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
        receivingUser?.socket.emit("offer", { sdp, roomId });
    }
    
    onAnswer(roomId: string, sdp: string, senderSocketid: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const receivingUser = room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
        receivingUser?.socket.emit("answer", { sdp, roomId });
    }

    onIceCandidates(roomId: string, senderSocketid: string, candidate: any, type: "sender" | "receiver") {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const receivingUser = room.user1.socket.id === senderSocketid ? room.user2 : room.user1;
        receivingUser.socket.emit("add-ice-candidate", ({candidate, type}));
    }

    // NEW: teardown helpers for robust leave/next flows
    teardownUser(roomId: string, userId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const other = room.user1.socket.id === userId ? room.user2 : room.user1;
        // Notify other side that this room is done (front-end can stop peer connection)
        other.socket.emit("partner:left", { reason: "room-teardown" });
        this.rooms.delete(roomId);
    }

    teardownRoom(roomId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Optionally notify both sides (guard if sockets are still connected)
        try { room.user1.socket.emit("partner:left", { reason: "room-teardown" }); } catch {}
        try { room.user2.socket.emit("partner:left", { reason: "room-teardown" }); } catch {}
        this.rooms.delete(roomId);
    }

    generate() {
        return GLOBAL_ROOM_ID++;
    }
}