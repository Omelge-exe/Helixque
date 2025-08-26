"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Loader2,
  User,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MessageSquareText,
  PhoneOff,
  SkipForward,
  RefreshCw,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import ChatPanel from "./Chat/chat"; // ← adjust path if different

// const URL = process.env.BACKEND_URI;
const URL = process.env.BACKEND_URI || "http://localhost:5001";

export default function Room({
  name,
  localAudioTrack,
  localVideoTrack,
}: {
  name: string;
  localAudioTrack: MediaStreamTrack | null;
  localVideoTrack: MediaStreamTrack | null;
}) {
  const router = useRouter();

  // meet-like states
  const [showChat, setShowChat] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [mySocketId, setMySocketId] = useState<string | null>(null);

  const [lobby, setLobby] = useState(true);
  const [status, setStatus] = useState<string>("Waiting to connect you to someone…");

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // Peer mic indicator (keeping this; camera overlay removed per your request)
  const [peerMicOn, setPeerMicOn] = useState(true);
  const [peerCamOn, setPeerCamOn] = useState(true);

  // DOM refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // socket/pc refs
  const socketRef = useRef<Socket | null>(null);
  const sendingPcRef = useRef<RTCPeerConnection | null>(null);
  const receivingPcRef = useRef<RTCPeerConnection | null>(null);
  const joinedRef = useRef(false);

  // our outbound video sender and current local video track
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const currentVideoTrackRef = useRef<MediaStreamTrack | null>(localVideoTrack);

  // persistent remote stream
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // --- Helpers --------------------------------------------------------------

  function ensureRemoteStream() {
    // Always ensure we have a valid MediaStream
    if (!remoteStreamRef.current) {
      console.log("Creating new remote MediaStream");
      remoteStreamRef.current = new MediaStream();
    }

    const v = remoteVideoRef.current;
    if (v) {
      if (v.srcObject !== remoteStreamRef.current) {
        console.log("Setting remote video srcObject");
        v.srcObject = remoteStreamRef.current;
        v.playsInline = true;
        v.play().catch((err) => {
          console.error("Error playing remote video:", err);
        });
      }
    }

    const a = remoteAudioRef.current;
    if (a) {
      if (a.srcObject !== remoteStreamRef.current) {
        console.log("Setting remote audio srcObject");
        a.srcObject = remoteStreamRef.current;
        a.autoplay = true;
        a.muted = false;
        a.play().catch((err) => {
          console.error("Error playing remote audio:", err);
        });
      }
    }
  }

  function detachLocalPreview() {
    try {
      const localStream = localVideoRef.current?.srcObject as MediaStream | null;
      if (localStream) {
        localStream.getTracks().forEach((t) => {
          try {
            console.log(`Stopping track of kind ${t.kind}`);
            t.stop();
          } catch (err) {
            console.error(`Error stopping ${t.kind} track:`, err);
          }
        });
      }
    } catch (err) {
      console.error("Error in detachLocalPreview:", err);
    }
    
    if (localVideoRef.current) {
      try {
        localVideoRef.current.pause();
      } catch {}
      localVideoRef.current.srcObject = null;
    }
  }

  function stopProvidedTracks() {
    try {
      // Immediately stop video track to turn off camera LED
      if (localVideoTrack) {
        localVideoTrack.stop();
        console.log("Local video track stopped");
      }
    } catch (err) {
      console.error("Error stopping local video track:", err);
    }
    
    try {
      if (localAudioTrack) {
        localAudioTrack.stop();
      }
    } catch (err) {
      console.error("Error stopping local audio track:", err);
    }
    
    // Also stop any track in currentVideoTrackRef
    try {
      const currentTrack = currentVideoTrackRef.current;
      if (currentTrack) {
        currentTrack.stop();
        currentVideoTrackRef.current = null;
        console.log("Current video track stopped");
      }
    } catch (err) {
      console.error("Error stopping current video track:", err);
    }
  }

  function teardownPeers(reason = "teardown") {
    console.log("Tearing down peers, reason:", reason);
    
    // Clean up all senders in both peer connections
    try {
      if (sendingPcRef.current) {
        try {
          sendingPcRef.current.getSenders().forEach((sn) => {
            try {
              sendingPcRef.current?.removeTrack(sn);
            } catch (err) {
              console.error("Error removing sender track:", err);
            }
          });
        } catch {}
        sendingPcRef.current.close();
      }
      if (receivingPcRef.current) {
        try {
          receivingPcRef.current.getSenders().forEach((sn) => {
            try {
              receivingPcRef.current?.removeTrack(sn);
            } catch (err) {
              console.error("Error removing receiver track:", err);
            }
          });
        } catch {}
        receivingPcRef.current.close();
      }
    } catch (err) {
      console.error("Error in peer connection cleanup:", err);
    }
    
    // Clear peer connection refs
    sendingPcRef.current = null;
    receivingPcRef.current = null;

    // Clean up remote stream
    if (remoteStreamRef.current) {
      try {
        const tracks = remoteStreamRef.current.getTracks();
        console.log(`Stopping ${tracks.length} remote tracks`);
        tracks.forEach((t) => {
          try {
            t.stop();
          } catch (err) {
            console.error(`Error stopping remote ${t.kind} track:`, err);
          }
        });
      } catch (err) {
        console.error("Error stopping remote tracks:", err);
      }
    }
    
    // Reset remote stream
    remoteStreamRef.current = new MediaStream();
    
    // Clear video elements
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
      try {
        remoteVideoRef.current.load();
      } catch {}
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      try {
        remoteAudioRef.current.load();
      } catch {}
    }

    // Reset UI states
    setShowChat(false);
    setPeerMicOn(true);
    setPeerCamOn(true);

    // Clear video sender ref
    videoSenderRef.current = null;

    // Return to lobby
    setLobby(true);
    if (reason === "partner-left") {
      setStatus("Partner left. Finding a new match…");
    } else if (reason === "next") {
      setStatus("Searching for your next match…");
    } else {
      setStatus("Waiting to connect you to someone…");
    }
  }

  // mic/cam toggles
  const toggleMic = () => {
    const on = !micOn;
    setMicOn(on);
    try {
      if (localAudioTrack) localAudioTrack.enabled = on;
    } catch {}
  };

  // Ensure there's a stable outbound video transceiver/sender.
// This gives you a permanent "slot" to replaceTrack(null|track) without renegotiation.
function getOrCreateVideoSender(pc: RTCPeerConnection | null): RTCRtpSender | null {
  if (!pc) return null;

  // If we already have a sender cached and still attached to this PC, reuse it
  if (videoSenderRef.current && pc.getSenders().includes(videoSenderRef.current)) {
    return videoSenderRef.current;
  }

  // Try to find an existing video sender
  const existing = pc.getSenders().find(
    (s) =>
      s.track?.kind === "video" ||
      (s as any)?.transceiver?.receiver?.track?.kind === "video"
  );
  if (existing) {
    videoSenderRef.current = existing;
    return existing;
  }

  // Create a dedicated transceiver for video with sendrecv,
  // so we can start sending later without renegotiation.
  const tx = pc.addTransceiver("video", { direction: "sendrecv" });
  videoSenderRef.current = tx.sender;
  return tx.sender;
}

  const toggleCam = async () => {
    const turningOn = !camOn;
    setCamOn(turningOn);

    try {
      const pc = sendingPcRef.current || receivingPcRef.current;

      if (turningOn) {
        // (Re)acquire a real camera track
        let track = currentVideoTrackRef.current;
        if (!track || track.readyState === "ended") {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          track = stream.getVideoTracks()[0];
          currentVideoTrackRef.current = track;
        }

        // Update local PiP stream
        if (localVideoRef.current) {
          const ms =
            (localVideoRef.current.srcObject as MediaStream) || new MediaStream();
          if (!localVideoRef.current.srcObject) localVideoRef.current.srcObject = ms;
          ms.getVideoTracks().forEach((t) => ms.removeTrack(t));
          ms.addTrack(track);
          await localVideoRef.current.play().catch(() => {});
        }

        // Resume sending to peer
        if (videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(track);
        } else if (pc) {
          const sender = pc.addTrack(track);
          videoSenderRef.current = sender;
        }
      } else {
        // Turn OFF: stop sending and immediately stop the camera
        if (videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(null);
        }

        // Immediately stop all video tracks to turn off camera LED
        const track = currentVideoTrackRef.current;
        if (track) {
          try {
            // Ensure we stop the track immediately to turn off the camera LED
            track.stop();
            console.log("Camera track stopped");
          } catch (err) {
            console.error("Error stopping camera track:", err);
          }
          currentVideoTrackRef.current = null;
        }

        // Also stop any video tracks in the local preview
        if (localVideoRef.current && localVideoRef.current.srcObject) {
          const ms = localVideoRef.current.srcObject as MediaStream;
          const videoTracks = ms.getVideoTracks();
          for (const t of videoTracks) {
            try {
              t.stop(); // Make sure we stop each track
              ms.removeTrack(t);
            } catch (err) {
              console.error("Error stopping local preview track:", err);
            }
          }
          // leave audio track (if any) untouched
        }
        
        // If we have any other video tracks anywhere, stop them too
        if (localVideoTrack) {
          try {
            localVideoTrack.stop();
          } catch {}
        }
      }
    } catch (e) {
      console.error("toggleCam error", e);
    }
  };

  // --- Effects --------------------------------------------------------------

  // keep a ref of the latest incoming localVideoTrack initially
  useEffect(() => {
    if (localVideoTrack) {
      currentVideoTrackRef.current = localVideoTrack;
    }
  }, [localVideoTrack]);

  // Bind remote when leaving lobby
  useEffect(() => {
    if (!lobby) ensureRemoteStream();
  }, [lobby]);

  // Local preview: attach once tracks exist; retry play on first click (autoplay)
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (!localVideoTrack && !localAudioTrack) return;

    const stream = new MediaStream([
      ...(localVideoTrack ? [localVideoTrack] : []),
      ...(localAudioTrack ? [localAudioTrack] : []),
    ]);

    el.srcObject = stream;
    el.muted = true;
    el.playsInline = true;

    const tryPlay = () => el.play().catch(() => {});
    tryPlay();

    const onceClick = () => {
      tryPlay();
      window.removeEventListener("click", onceClick);
    };
    window.addEventListener("click", onceClick, { once: true });

    return () => window.removeEventListener("click", onceClick);
  }, [localAudioTrack, localVideoTrack]);

  // Broadcast our media state whenever it changes (optional)
  useEffect(() => {
    if (!roomId || !socketRef.current) return;
    socketRef.current.emit("media:state", { roomId, state: { micOn, camOn } });
  }, [micOn, camOn, roomId]);

  // Socket / WebRTC wiring
  useEffect(() => {
    if (socketRef.current) return;

    const s = io(URL, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      auth: { name }, // server will see the display name
    });

    socketRef.current = s;
    s.connect();

    s.on("connect", () => {
      setMySocketId(s.id ?? null);
      if (!joinedRef.current) {
        joinedRef.current = true;
      }
    });

    // ----- CALLER -----
    s.on("send-offer", async ({ roomId: rid }) => {
      setRoomId(rid);
      s.emit("chat:join", { roomId: rid, name });
      setLobby(false);
      setStatus("Connecting…");

      const pc = new RTCPeerConnection();
      sendingPcRef.current = pc;

      // Add initial local tracks; remember the video sender
      if (localVideoTrack && localVideoTrack.readyState === "live" && camOn) {
        const vs = pc.addTrack(localVideoTrack);
        videoSenderRef.current = vs;
        console.log("Added local video track to caller PC");
      }
      if (localAudioTrack && localAudioTrack.readyState === "live" && micOn) {
        pc.addTrack(localAudioTrack);
        console.log("Added local audio track to caller PC");
      }

      ensureRemoteStream();
      pc.ontrack = (e) => {
        console.log(`Caller received ${e.track.kind} track`);
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(e.track);
        ensureRemoteStream(); // Ensure video element has the updated stream
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          s.emit("add-ice-candidate", { candidate: e.candidate, type: "sender", roomId: rid });
        }
      };

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      s.emit("offer", { sdp: offer, roomId: rid });
    });

    // ----- ANSWERER -----
    s.on("offer", async ({ roomId: rid, sdp: remoteSdp }) => {
      setRoomId(rid);
      s.emit("chat:join", { roomId: rid, name });
      setLobby(false);
      setStatus("Connecting…");

      const pc = new RTCPeerConnection();
      receivingPcRef.current = pc;

      if (localVideoTrack && localVideoTrack.readyState === "live" && camOn) {
        const vs = pc.addTrack(localVideoTrack);
        videoSenderRef.current = vs;
        console.log("Added local video track to answerer PC");
      }
      if (localAudioTrack && localAudioTrack.readyState === "live" && micOn) {
        pc.addTrack(localAudioTrack);
        console.log("Added local audio track to answerer PC");
      }

      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));

      ensureRemoteStream();
      pc.ontrack = (e) => {
        console.log(`Answerer received ${e.track.kind} track`);
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(e.track);
        ensureRemoteStream(); // Ensure video element has the updated stream
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          s.emit("add-ice-candidate", { candidate: e.candidate, type: "receiver", roomId: rid });
        }
      };

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      s.emit("answer", { roomId: rid, sdp: answer });
    });

    // caller receives answer
    s.on("answer", async ({ sdp: remoteSdp }) => {
      const pc = sendingPcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
    });

    // trickle ICE
    s.on("add-ice-candidate", async ({ candidate, type }) => {
      try {
        const ice = new RTCIceCandidate(candidate);
        if (type === "sender") {
          await receivingPcRef.current?.addIceCandidate(ice);
        } else {
          await sendingPcRef.current?.addIceCandidate(ice);
        }
      } catch (e) {
        console.error("addIceCandidate error", e);
      }
    });

    // lobby / searching
    s.on("lobby", () => {
      setLobby(true);
      setStatus("Waiting to connect you to someone…");
    });
    s.on("queue:waiting", () => {
      setLobby(true);
      setStatus("Searching for the best match…");
    });

    // partner left
    s.on("partner:left", () => {
      teardownPeers("partner-left");
    });

    // peer mic state (optional UI)
    s.on("peer:media-state", ({ state }: { state: { micOn?: boolean; camOn?: boolean } }) => {
      if (typeof state?.micOn === "boolean") setPeerMicOn(state.micOn);
      if (typeof state?.camOn === "boolean") setPeerCamOn(state.camOn);
    });
    s.on("media:mic", ({ on }: { on: boolean }) => setPeerMicOn(!!on));
    s.on("media:cam", ({ on }: { on: boolean }) => setPeerCamOn(!!on));

    const onBeforeUnload = () => {
      try {
        s.emit("queue:leave");
      } catch {}
      stopProvidedTracks();
      detachLocalPreview();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);

      s.off("connect");
      s.off("send-offer");
      s.off("offer");
      s.off("answer");
      s.off("add-ice-candidate");
      s.off("lobby");
      s.off("queue:waiting");
      s.off("partner:left");
      s.off("peer:media-state");
      s.off("media:mic");

      try {
        s.emit("queue:leave");
      } catch {}
      s.disconnect();
      socketRef.current = null;

      try {
        sendingPcRef.current?.close();
      } catch {}
      try {
        receivingPcRef.current?.close();
      } catch {}
      sendingPcRef.current = null;
      receivingPcRef.current = null;

      if (remoteStreamRef.current) {
        try {
          remoteStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch {}
      }
      remoteStreamRef.current = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

      detachLocalPreview();
      setRoomId(null);
      setShowChat(false);
      videoSenderRef.current = null;
    };
  }, [name, localAudioTrack, localVideoTrack]);

  // --- Actions --------------------------------------------------------------

const handleNext = () => {
    const s = socketRef.current;
    if (!s) return;

    // Clear current remote media immediately for snappy UX
    try {
      remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    s.emit("queue:next");
    teardownPeers("next");
    remoteStreamRef.current = new MediaStream();
  };


  const handleLeave = () => {
    const s = socketRef.current;
    try {
      s?.emit("queue:leave");
    } catch {}
    teardownPeers("teardown");
    stopProvidedTracks();
    detachLocalPreview();
    router.push("/");
  };

  const handleRecheck = () => {
    setLobby(true);
    setStatus("Rechecking…");
  };

  // --- UI -------------------------------------------------------------------

  return (
    <div className="relative flex min-h-screen flex-col bg-neutral-950 text-white">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-neutral-900/60 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500" />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">Meeting</div>
              <div className="text-[11px] text-white/60">Room {roomId ?? "—"}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-[12px] text-white/70">
              {name ? (
                <>Signed in as <span className="text-white">{name}</span></>
              ) : (
                <span className="text-white/60">Not signed in</span>
              )}
            </div>

            <button
              onClick={() => setShowChat((v) => !v)}
              className={`ml-2 h-9 w-9 rounded-full border border-white/10 hover:bg-white/10 flex items-center justify-center transition ${
                showChat ? "bg-indigo-600 hover:bg-indigo-500" : "bg-transparent"
              }`}
              title={showChat ? "Close chat" : "Open chat"}
            >
              <MessageSquareText className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Stage */}
      <main className="relative flex-1">
        <div className="relative mx-auto max-w-[1400px] px-4 pt-4 pb-28">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            {/* Remote video ALWAYS present */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Lobby overlay only */}
            {lobby && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                <Loader2 className="h-10 w-10 animate-spin text-white/70" />
                <span className="text-sm text-white/70">{status}</span>
              </div>
            )}
            {!peerCamOn && !lobby && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <User className="h-12 w-12 text-white/70" />
              </div>
            )}
            {/* Remote label with mic badge (optional) */}
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs">
              <span>{lobby ? "—" : "Peer"}</span>
              {!lobby && !peerMicOn && (
                <span className="ml-1 inline-flex items-center gap-1 rounded bg-red-600/80 px-1.5 py-0.5">
                  <MicOff className="h-3 w-3" />
                  <span>muted</span>
                </span>
              )}
            </div>

            {/* Hidden remote audio */}
            <audio ref={remoteAudioRef} style={{ display: "none" }} />

            {/* Local PiP */}
            <div className="pointer-events-auto absolute bottom-4 right-4 w-44 sm:w-56 md:w-64">
              <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {!camOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-xs text-white/70">
                    <User className="h-12 w-12 text-white/70" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px]">
                  {name || "You"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-50 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-2 py-1.5 backdrop-blur">
            <button
              onClick={handleRecheck}
              className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              title="Recheck"
            >
              <RefreshCw className="h-5 w-5" />
            </button>

            <button
              onClick={toggleMic}
              className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                micOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-500"
              }`}
              title={micOn ? "Turn off microphone" : "Turn on microphone"}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            <button
              onClick={toggleCam}
              className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                camOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-500"
              }`}
              title={camOn ? "Turn off camera" : "Turn on camera"}
            >
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>

            <button
              onClick={handleNext}
              className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              title="Next match"
            >
              <SkipForward className="h-5 w-5" />
            </button>

            <button
              onClick={handleLeave}
              className="ml-1 mr-1 h-11 rounded-full bg-red-600 px-6 hover:bg-red-500 flex items-center justify-center gap-2"
              title="Leave call"
            >
              <PhoneOff className="h-5 w-5" />
              <span className="hidden sm:inline text-sm font-medium">Leave</span>
            </button>
          </div>
        </div>

        {/* Chat Drawer */}
        <div
          className={`fixed top-14 right-0 z-40 h-[calc(100vh-56px)] w-full sm:w-[360px] md:w-[420px] lg:w-[460px] transform border-l border-white/10 bg-neutral-900/95 backdrop-blur transition-transform duration-300 ${
            showChat ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
            <div className="text-sm font-medium text-white/80">In-call messages</div>
            <button
              onClick={() => setShowChat(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              title="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="h-[calc(100%-48px)]">
            <ChatPanel
              socket={socketRef.current}
              roomId={roomId}
              name={name}
              mySocketId={mySocketId}
              collapsed={false}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
