"use client";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

type ChatMessage = {
  text: string;
  from: string;
  clientId: string;
  ts: number;
  kind?: "user" | "system";
};

const MAX_LEN = 1000;        // match server cap
const MAX_BUFFER = 300;      // keep memory tidy
const TYPING_DEBOUNCE = 350; // ms

export default function ChatPanel({
  socket,
  roomId,
  name,
  mySocketId,
  collapsed = false,
}: {
  socket: Socket | null;
  roomId: string | null;
  name: string;
  mySocketId: string | null;
  collapsed?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [peerTyping, setPeerTyping] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidRef = useRef<string | null>(mySocketId ?? null);

  // derive & keep socket.id fresh for self-dedupe
  useEffect(() => {
    if (!socket) return;
    const setSid = () => {
      sidRef.current = socket.id || sidRef.current || null;
    };
    setSid();
    socket.on("connect", setSid);
    return () => {
      socket.off("connect", setSid);
    };
  }, [socket]);

  const canSend = !!socket && socket.connected && !!roomId && !!name && !!(sidRef.current || mySocketId);

  // auto-scroll to bottom on new messages - DISABLED per user request
  // useEffect(() => {
  //   scrollerRef.current?.scrollTo({
  //     top: scrollerRef.current.scrollHeight,
  //     behavior: "smooth",
  //   });
  // }, [messages.length]);

  // wire socket events + (re)join on mount/room change/reconnect
  useEffect(() => {
    if (!socket || !roomId) return;

    const join = () => socket.emit("chat:join", { roomId, name });
    join(); // initial
    const onConnect = () => {
      // re-join on reconnect
      sidRef.current = socket.id ?? null;
      join();
    };

    const onMsg = (m: ChatMessage) => {
      // skip server echo of my optimistic send
      const myId = mySocketId || sidRef.current;
      if (m.clientId === myId) return;
      setMessages((prev) => {
        const next = [...prev, { ...m, kind: "user" as const }];
        return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
      });
    };

    const onSystem = (m: { text: string; ts?: number }) => {
      setMessages((prev) => {
        const next = [
          ...prev,
          { text: m.text, from: "system", clientId: "system", ts: m.ts ?? Date.now(), kind: "system" as const },
        ];
        return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
      });
    };

    const onTyping = ({ from, typing }: { from: string; typing: boolean }) => {
      setPeerTyping(typing ? `${from} is typing…` : null);
      if (typing) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPeerTyping(null), 3000);
      }
    };

    const onPartnerLeft = ({ reason }: { reason: string }) => {
      onSystem({ text: `Your partner left (${reason}).` });
    };

    socket.on("connect", onConnect);
    socket.on("chat:message", onMsg);
    socket.on("chat:system", onSystem);
    socket.on("chat:typing", onTyping);
    socket.on("partner:left", onPartnerLeft);

    // optional: clear chat when switching rooms
    setMessages([]);

    return () => {
      socket.off("connect", onConnect);
      socket.off("chat:message", onMsg);
      socket.off("chat:system", onSystem);
      socket.off("chat:typing", onTyping);
      socket.off("partner:left", onPartnerLeft);
      // stop typing when leaving room/unmounting
      socket.emit("chat:typing", { roomId, from: name, typing: false });
    };
  }, [socket, roomId, name, mySocketId]);

  const sendMessage = () => {
    if (!canSend || !input.trim()) return;
    const myId = mySocketId || sidRef.current!;
    const payload = {
      roomId: roomId!,
      text: input.trim().slice(0, MAX_LEN),
      from: name,
      clientId: myId,
      ts: Date.now(),
    };
    // optimistic add
    setMessages((prev) => {
      const next = [...prev, { ...payload, kind: "user" as const }];
      return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next;
    });
    socket!.emit("chat:message", payload);
    setInput("");
    socket!.emit("chat:typing", { roomId, from: name, typing: false });
  };

  const handleTyping = (value: string) => {
    setInput(value);
    if (!socket || !roomId) return;

    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      socket.emit("chat:typing", { roomId, from: name, typing: !!value });
    }, TYPING_DEBOUNCE);
  };

  if (collapsed) return null;

  return (
    <div className="flex flex-col h-full bg-neutral-950 rounded-l-2xl overflow-hidden">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.map((m, idx) => {
          const myId = mySocketId || sidRef.current;
          const mine = m.clientId === myId;
          const isSystem = m.kind === "system";
          return (
            <div key={idx} className={`flex ${isSystem ? "justify-center" : mine ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  isSystem
                    ? "text-xs text-white/50 italic"
                    : `max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        mine ? "bg-indigo-600 text-white" : "bg-white/10 text-white/90"
                      }`
                }
                title={new Date(m.ts).toLocaleTimeString()}
              >
                {isSystem ? (
                  <span>{m.text}</span>
                ) : (
                  <>
                    {!mine && <div className="text-[10px] text-white/60 mb-1">{m.from}</div>}
                    <div>{m.text}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {peerTyping && <div className="text-xs text-white/60 italic">{peerTyping}</div>}
      </div>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/60"
            placeholder={canSend ? "Type a message…" : "Connecting chat…"}
            value={input}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            disabled={!canSend}
            maxLength={MAX_LEN}
          />
          <button
            onClick={sendMessage}
            disabled={!canSend || !input.trim()}
            className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
