"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Loader2 } from "lucide-react";

const URL = "http://localhost:3000";

export default function Room({
  name,
  localAudioTrack,
  localVideoTrack,
}: {
  name: string;
  localAudioTrack: MediaStreamTrack | null;
  localVideoTrack: MediaStreamTrack | null;
}) {
  const [lobby, setLobby] = useState(true);

  // DOM refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // socket/pc refs (so we don't reconnect in StrictMode)
  const socketRef = useRef<Socket | null>(null);
  const sendingPcRef = useRef<RTCPeerConnection | null>(null);    // caller
  const receivingPcRef = useRef<RTCPeerConnection | null>(null);  // answerer
  const joinedRef = useRef(false);

  // persistent remote stream
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // helper: ensure remote stream exists + is bound to <video>
  function ensureRemoteStream() {
    if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
    const el = remoteVideoRef.current;
    if (el && el.srcObject !== remoteStreamRef.current) {
      el.srcObject = remoteStreamRef.current;
      el.playsInline = true;
      el.muted = true; // start muted to satisfy autoplay policies
      el.play().catch(() => {});
    }
  }

  // bind remote stream when lobby flips or element mounts
  useEffect(() => {
    if (!lobby) ensureRemoteStream();
  }, [lobby]);

  // local preview
  useEffect(() => {
    if (localVideoRef.current && localVideoTrack) {
      const stream = new MediaStream([
        localVideoTrack,
        ...(localAudioTrack ? [localAudioTrack] : []),
      ]);
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      localVideoRef.current.playsInline = true;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localAudioTrack, localVideoTrack]);

  useEffect(() => {
    if (socketRef.current) return; // prevent duplicate connections

    const s = io(URL, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socketRef.current = s;
    s.connect();

    s.on("connect", () => {
      // If you need to notify server you joined, do it once
      if (!joinedRef.current) {
        // s.emit("join-room", { name })
        joinedRef.current = true;
      }
    });

    // ========== CALLER ==========
    s.on("send-offer", async ({ roomId }) => {
      setLobby(false);

      const pc = new RTCPeerConnection();
      sendingPcRef.current = pc;

      // add local media
      if (localVideoTrack) pc.addTrack(localVideoTrack);
      if (localAudioTrack) pc.addTrack(localAudioTrack);

      // caller MUST attach remote tracks
      ensureRemoteStream();
      pc.ontrack = (e) => {
        console.log("[caller] remote track:", e.track.kind);
        remoteStreamRef.current!.addTrack(e.track);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          s.emit("add-ice-candidate", {
            candidate: e.candidate,
            type: "sender",
            roomId,
          });
        }
      };
      pc.oniceconnectionstatechange = () =>
        console.log("[caller] ICE:", pc.iceConnectionState);

      // create + send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      s.emit("offer", { sdp: offer, roomId });
    });

    // ========== ANSWERER ==========
    s.on("offer", async ({ roomId, sdp: remoteSdp }) => {
      setLobby(false);

      const pc = new RTCPeerConnection();
      receivingPcRef.current = pc;

      // add local media (answerer must send its media too)
      if (localVideoTrack) pc.addTrack(localVideoTrack);
      if (localAudioTrack) pc.addTrack(localAudioTrack);

      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));

      ensureRemoteStream();
      pc.ontrack = (e) => {
        console.log("[answerer] remote track:", e.track.kind);
        remoteStreamRef.current!.addTrack(e.track);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          s.emit("add-ice-candidate", {
            candidate: e.candidate,
            type: "receiver",
            roomId,
          });
        }
      };
      pc.oniceconnectionstatechange = () =>
        console.log("[answerer] ICE:", pc.iceConnectionState);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit("answer", { roomId, sdp: answer });
    });

    // caller receives answer
    s.on("answer", async ({ sdp: remoteSdp }) => {
      const pc = sendingPcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
    });

    // trickle ICE both ways
    s.on("add-ice-candidate", async ({ candidate, type }) => {
      try {
        const ice = new RTCIceCandidate(candidate);
        if (type === "sender") {
          // to caller from answerer
          await receivingPcRef.current?.addIceCandidate(ice);
        } else {
          // to answerer from caller
          await sendingPcRef.current?.addIceCandidate(ice);
        }
      } catch (e) {
        console.error("addIceCandidate error", e);
      }
    });

    // optional: lobby reset
    s.on("lobby", () => setLobby(true));

    return () => {
      s.off("connect");
      s.off("send-offer");
      s.off("offer");
      s.off("answer");
      s.off("add-ice-candidate");
      s.off("lobby");
      s.disconnect();
      socketRef.current = null;

      try {
        sendingPcRef.current?.getSenders().forEach((sn) => sn.track?.stop());
        receivingPcRef.current?.getSenders().forEach((sn) => sn.track?.stop());
        sendingPcRef.current?.close();
        receivingPcRef.current?.close();
      } catch {}
      sendingPcRef.current = null;
      receivingPcRef.current = null;
      remoteStreamRef.current = null;
    };
  }, [name, localAudioTrack, localVideoTrack]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="w-full border-b border-white/10 bg-gray-900/60 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500" />
            <h1 className="text-lg font-semibold tracking-tight">DevMatch Room</h1>
          </div>
          <div className="text-sm text-white/70">
            Signed in as <span className="text-white">{name}</span>
          </div>
        </div>
      </header>

      {/* Video grid */}
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Local video */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="p-3 flex items-center justify-between border-b border-white/10">
              <div className="text-sm font-medium text-white/80">You</div>
              <div className="text-[10px] uppercase tracking-wider text-white/50">Local Preview</div>
            </div>
            <div className="relative aspect-video bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute bottom-3 left-3 text-xs bg-black/60 px-2 py-1 rounded-md">
                {name}
              </div>
            </div>
          </div>

          {/* Remote video */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="p-3 flex items-center justify-between border-b border-white/10">
              <div className="text-sm font-medium text-white/80">Peer</div>
              <div className="text-[10px] uppercase tracking-wider text-white/50">Remote Stream</div>
            </div>
            <div className="relative aspect-video bg-black flex items-center justify-center">
              {lobby ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-white/60" />
                  <span className="text-sm text-white/60">Waiting to connect you to someone…</span>
                </div>
              ) : (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute bottom-3 left-3 text-xs bg-black/60 px-2 py-1 rounded-md">
                {lobby ? "—" : "Connected"}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/10 bg-gray-900/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3 justify-end">
          <span className="mr-auto text-xs text-white/60">
            Tip: keep this tab active while matching.
          </span>
          <button
            className="h-10 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm hover:bg-white/[0.08] transition"
            onClick={() => window.location.reload()}
          >
            Recheck
          </button>
          <a
            href="/"
            className="h-10 rounded-xl bg-red-600 hover:bg-red-500 px-4 text-sm font-medium transition"
          >
            Leave
          </a>
        </div>
      </footer>
    </div>
  );
}
