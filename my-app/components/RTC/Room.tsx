"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconVideo,
  IconVideoOff,
  IconPhoneOff,
  IconScreenShare,
  IconScreenShareOff,
  IconPlayerSkipForward,
  IconRefresh,
  IconMessage,
  IconX,
  IconUser,
  IconLoader2,
  IconFlag,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import ChatPanel from "./Chat/chat"; // ← adjust path if different

// const URL = process.env.BACKEND_URI;
const URL = process.env.BACKEND_URI || "https://poc-v2-1.onrender.com";

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
  const [screenShareOn, setScreenShareOn] = useState(false);

  

  // Peer mic indicator (keeping this; camera overlay removed per your request)
  const [peerMicOn, setPeerMicOn] = useState(true);
  const [peerCamOn, setPeerCamOn] = useState(true);
  const [peerScreenShareOn, setPeerScreenShareOn] = useState(false);

  // DOM refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localScreenShareRef = useRef<HTMLVideoElement>(null);
  const remoteScreenShareRef = useRef<HTMLVideoElement>(null);

  // socket/pc refs
  const socketRef = useRef<Socket | null>(null);
  const sendingPcRef = useRef<RTCPeerConnection | null>(null);
  const receivingPcRef = useRef<RTCPeerConnection | null>(null);
  const joinedRef = useRef(false);

  // our outbound video sender and current local video track
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const currentVideoTrackRef = useRef<MediaStreamTrack | null>(localVideoTrack);

  // screenshare tracks and streams
  const currentScreenShareTrackRef = useRef<MediaStreamTrack | null>(null);
  const localScreenShareStreamRef = useRef<MediaStream | null>(null);

  // persistent remote stream
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // --- Helpers --------------------------------------------------------------

  function ensureRemoteStream() {
    console.log("🔄 ensureRemoteStream called");
    // Always ensure we have a valid MediaStream
    if (!remoteStreamRef.current) {
      console.log("📺 Creating new remote MediaStream");
      remoteStreamRef.current = new MediaStream();
    }

    const v = remoteVideoRef.current;
    if (v) {
      console.log("🎥 Remote video element found");
      if (v.srcObject !== remoteStreamRef.current) {
        console.log("🔗 Setting remote video srcObject");
        console.log("📊 Remote stream tracks:", remoteStreamRef.current.getTracks().length);
        remoteStreamRef.current.getTracks().forEach((track, index) => {
          console.log(`📹 Track ${index}:`, {
            id: track.id,
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState,
            settings: track.getSettings()
          });
        });
        
        v.srcObject = remoteStreamRef.current;
        v.playsInline = true;
        v.play().catch((err) => {
          console.error("❌ Error playing remote video:", err);
        });
        
        // Add event listeners to track video state changes
        v.onloadedmetadata = () => {
          console.log("📺 Remote video metadata loaded:", {
            videoWidth: v.videoWidth,
            videoHeight: v.videoHeight,
            duration: v.duration
          });
        };
        
        v.onplay = () => {
          console.log("▶️ Remote video started playing");
        };
        
        v.onpause = () => {
          console.log("⏸️ Remote video paused");
        };
        
        v.onerror = (e) => {
          console.error("💥 Remote video error:", e);
        };
      } else {
        console.log("🔄 Remote video srcObject already set, checking state");
        console.log("📊 Video element state:", {
          paused: v.paused,
          currentTime: v.currentTime,
          videoWidth: v.videoWidth,
          videoHeight: v.videoHeight,
          readyState: v.readyState
        });
      }
    } else {
      console.warn("❌ Remote video element not found");
    }

    // Also update the remote screen share video if it exists
    const screenShareVideo = remoteScreenShareRef.current;
    if (screenShareVideo && peerScreenShareOn) {
      if (screenShareVideo.srcObject !== remoteStreamRef.current) {
        console.log("🖥️ Setting remote screen share video srcObject");
        screenShareVideo.srcObject = remoteStreamRef.current;
        screenShareVideo.playsInline = true;
        screenShareVideo.play().catch((err) => {
          console.error("❌ Error playing remote screen share video:", err);
        });
      }
    }

    const a = remoteAudioRef.current;
    if (a) {
      if (a.srcObject !== remoteStreamRef.current) {
        console.log("🔊 Setting remote audio srcObject");
        a.srcObject = remoteStreamRef.current;
        a.autoplay = true;
        a.muted = false;
        a.play().catch((err) => {
          console.error("❌ Error playing remote audio:", err);
        });
      }
    } else {
      console.warn("❌ Remote audio element not found");
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
              receivingPcRef.current?.removeTrack(sn)
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
    setScreenShareOn(false);
    setPeerScreenShareOn(false);

    // Clear video sender ref
    videoSenderRef.current = null;

    // Clean up screenshare streams
    if (localScreenShareStreamRef.current) {
      localScreenShareStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      localScreenShareStreamRef.current = null;
    }
    if (currentScreenShareTrackRef.current) {
      currentScreenShareTrackRef.current.stop();
      currentScreenShareTrackRef.current = null;
    }

    // Clear screenshare video elements
    if (localScreenShareRef.current) localScreenShareRef.current.srcObject = null;

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

//   // Ensure there's a stable outbound video transceiver/sender.
// // This gives you a permanent "slot" to replaceTrack(null|track) without renegotiation.
// function getOrCreateVideoSender(pc: RTCPeerConnection | null): RTCRtpSender | null {
//   if (!pc) {
//     console.warn("No peer connection provided to getOrCreateVideoSender");
//     return null;
//   }

//   // If we already have a sender cached and still attached to this PC, reuse it
//   if (videoSenderRef.current && pc.getSenders().includes(videoSenderRef.current)) {
//     console.log("Reusing existing video sender");
//     return videoSenderRef.current;
//   }

//   // Try to find an existing video sender
//   const existing = pc.getSenders().find(
//     (s) =>
//       s.track?.kind === "video" ||
//       (s as any)?.transceiver?.receiver?.track?.kind === "video"
//   );
//   if (existing) {
//     console.log("Found existing video sender");
//     videoSenderRef.current = existing;
//     return existing;
//   }

//   // Create a dedicated transceiver for video with sendrecv,
//   // so we can start sending later without renegotiation.
//   console.log("Creating new video transceiver");
//   const tx = pc.addTransceiver("video", { direction: "sendrecv" });
//   videoSenderRef.current = tx.sender;
//   console.log("Created video transceiver with sender:", tx.sender);
//   return tx.sender;
// }

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
          // No video sender exists, add the track and create sender
          const sender = pc.addTrack(track);
          videoSenderRef.current = sender;
          console.log("Added new video track to existing connection");
          
          // If we're adding a track to an existing connection, we might need to renegotiate
          if (sendingPcRef.current === pc) {
            // We're the caller, create new offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current?.emit("renegotiate-offer", { 
              roomId, 
              sdp: offer, 
              role: "caller" 
            });
            console.log("📤 Sent renegotiation offer for camera turn on");
          }
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
    } catch (e: any) {
      console.error("toggleCam error", e);
      toast.error("Camera Error", {
        description: e?.message || "Failed to toggle camera"
      });
    }
  };

  const toggleScreenShare = async () => {
    const turningOn = !screenShareOn;
    console.log("🖥️ Toggle screen share - turning:", turningOn ? "ON" : "OFF");
    setScreenShareOn(turningOn);

    try {
      const socket = socketRef.current;

      if (turningOn) {
        // Start screen sharing - use getDisplayMedia
        try {
          console.log("🎬 Starting screen capture...");
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true // Include system audio if available
          });

          const screenTrack = screenStream.getVideoTracks()[0];
          console.log("📺 Screen track obtained:", {
            id: screenTrack.id,
            kind: screenTrack.kind,
            enabled: screenTrack.enabled,
            readyState: screenTrack.readyState,
            settings: screenTrack.getSettings()
          });
          
          currentScreenShareTrackRef.current = screenTrack;
          localScreenShareStreamRef.current = screenStream;

          // Set up local screenshare preview
          if (localScreenShareRef.current) {
            localScreenShareRef.current.srcObject = screenStream;
            await localScreenShareRef.current.play().catch(() => {});
            console.log("🔍 Local screen share preview set up");
          }

          // Replace the existing video track with screen share track
          if (videoSenderRef.current) {
            console.log("📡 Video sender found, replacing track");
            console.log("🔄 Current video sender track:", videoSenderRef.current.track);
            console.log("🔗 Peer connection state:", (sendingPcRef.current || receivingPcRef.current)?.connectionState);
            
            await videoSenderRef.current.replaceTrack(screenTrack);
            console.log("✅ Successfully replaced video track with screen share track");
            console.log("📊 New track settings:", screenTrack.getSettings());
            
            toast.success("Screen Share Started", {
              description: "You are now sharing your screen"
            });
            
            // Verify the replacement
            console.log("🔍 Video sender track after replacement:", videoSenderRef.current.track);
            console.log("🎯 Track ID matches:", videoSenderRef.current.track?.id === screenTrack.id);
          } else {
            console.warn("❌ No video sender found, trying to create one");
            const pc = sendingPcRef.current || receivingPcRef.current;
            if (pc) {
              console.log("🔗 Adding screen track to peer connection");
              const sender = pc.addTrack(screenTrack, screenStream);
              videoSenderRef.current = sender;
              console.log("✅ Created new video sender for screen share");
              
              // Force renegotiation since we added a new track
              console.log("🔄 Triggering renegotiation for new track");
              if (sendingPcRef.current === pc) {
                // We're the caller, create new offer
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socketRef.current?.emit("renegotiate-offer", { 
                  roomId, 
                  sdp: offer, 
                  role: "caller" 
                });
                console.log("📤 Sent renegotiation offer");
              }
            } else {
              console.error("💥 No peer connection available for screen share");
              toast.error("Screen Share Error", {
                description: "No peer connection available for screen sharing"
              });
            }
          }

          // Notify peer that screenshare started using the new event system
          if (socket && roomId) {
            const mediaState = {
              isScreenSharing: true,
              micOn,
              camOn: false // Camera is replaced by screen share
            };
            console.log("📡 Emitting media-state-change:", mediaState);
            socket.emit("media-state-change", mediaState);
          }

          // Handle screen share ending (user clicks "Stop sharing" in browser)
          screenTrack.onended = async () => {
            setScreenShareOn(false);
            
            // Restore original camera track when screen share ends
            let cameraTrack = currentVideoTrackRef.current;
            if (!cameraTrack || cameraTrack.readyState === "ended") {
              // Get a new camera track if needed and camera should be on
              if (camOn) {
                try {
                  const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
                  cameraTrack = cameraStream.getVideoTracks()[0];
                  currentVideoTrackRef.current = cameraTrack;
                  
                  // Update local preview
                  if (localVideoRef.current) {
                    const localStream = localVideoRef.current.srcObject as MediaStream || new MediaStream();
                    localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
                    localStream.addTrack(cameraTrack);
                    if (!localVideoRef.current.srcObject) localVideoRef.current.srcObject = localStream;
                  }
                } catch (err: any) {
                  console.error("Error getting camera after screen share:", err);
                  toast.error("Camera Error", {
                    description: "Failed to restore camera after screen sharing"
                  });
                  cameraTrack = null;
                }
              }
            }
            
            // Replace screen share track with camera track (or null if camera disabled)
            if (videoSenderRef.current) {
              await videoSenderRef.current.replaceTrack(camOn ? cameraTrack : null);
            }

            // Clean up screen share resources
            if (localScreenShareRef.current) {
              localScreenShareRef.current.srcObject = null;
            }
            currentScreenShareTrackRef.current = null;
            localScreenShareStreamRef.current = null;

            toast.success("Screen Share Stopped", {
              description: "You have stopped sharing your screen"
            });

            // Notify peer that screenshare stopped
            if (socket && roomId) {
              socket.emit("media-state-change", {
                isScreenSharing: false,
                micOn,
                camOn
              });
            }
          };

        } catch (error: any) {
          console.error("Error starting screen share:", error);
          toast.error("Screen Share Error", {
            description: error?.message || "Failed to start screen sharing"
          });
          setScreenShareOn(false);
        }
      } else {
        // Stop screen sharing manually
        if (currentScreenShareTrackRef.current) {
          currentScreenShareTrackRef.current.stop();
        }
        if (localScreenShareStreamRef.current) {
          localScreenShareStreamRef.current.getTracks().forEach(t => t.stop());
          localScreenShareStreamRef.current = null;
        }
        if (localScreenShareRef.current) {
          localScreenShareRef.current.srcObject = null;
        }

        // Restore original camera track
        let cameraTrack = currentVideoTrackRef.current;
        if (!cameraTrack || cameraTrack.readyState === "ended") {
          // Get a new camera track if needed and camera should be on
          if (camOn) {
            try {
              const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
              cameraTrack = cameraStream.getVideoTracks()[0];
              currentVideoTrackRef.current = cameraTrack;
              
              // Update local preview
              if (localVideoRef.current) {
                const localStream = localVideoRef.current.srcObject as MediaStream || new MediaStream();
                localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
                localStream.addTrack(cameraTrack);
                if (!localVideoRef.current.srcObject) localVideoRef.current.srcObject = localStream;
              }
            } catch (err: any) {
              console.error("Error getting camera after stopping screen share:", err);
              toast.error("Camera Error", {
                description: "Failed to restore camera after stopping screen share"
              });
              cameraTrack = null;
            }
          }
        }

        // Replace screen share track with camera track (or null if camera disabled)
        if (videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(camOn ? cameraTrack : null);
        }

        // Notify peer that screenshare stopped
        if (socket && roomId) {
          socket.emit("media-state-change", {
            isScreenSharing: false,
            micOn,
            camOn
          });
        }

        currentScreenShareTrackRef.current = null;
      }
    } catch (error: any) {
      console.error("toggleScreenShare error", error);
      toast.error("Screen Share Error", {
        description: error?.message || "Failed to toggle screen sharing"
      });
      setScreenShareOn(false);
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

  // Update remote video elements when peer screen share state changes
  useEffect(() => {
    if (!lobby) ensureRemoteStream();
  }, [peerScreenShareOn, lobby]);

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
      
      toast.success("Connected!", {
        description: "You've been connected to someone"
      });

      const pc = new RTCPeerConnection();
      sendingPcRef.current = pc;

      // Reset video sender ref for new connection
      videoSenderRef.current = null;

      // Add initial local tracks based on state
      console.log(`🎥 Caller track setup - camOn: ${camOn}, micOn: ${micOn}`);
      if (localAudioTrack && localAudioTrack.readyState === "live" && micOn) {
        pc.addTrack(localAudioTrack);
        console.log("Added local audio track to caller PC");
      }
      
      // Handle video track - ensure we have a fresh track if camera is on
      if (camOn) {
        console.log("📹 Caller: Camera is ON, will add video track");
        let videoTrack = currentVideoTrackRef.current;
        
        // If we don't have a valid video track, create a new one
        if (!videoTrack || videoTrack.readyState === "ended") {
          console.log("Creating new video track for caller connection");
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoTrack = stream.getVideoTracks()[0];
            currentVideoTrackRef.current = videoTrack;
            console.log("📹 Created new video track:", videoTrack.id, "readyState:", videoTrack.readyState);
            
            // Update local preview with new track
            if (localVideoRef.current) {
              console.log("🎥 Updating local video preview with new track");
              const localStream = localVideoRef.current.srcObject as MediaStream || new MediaStream();
              const oldTracks = localStream.getVideoTracks();
              console.log("🗑️ Removing", oldTracks.length, "old video tracks from local preview");
              localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
              localStream.addTrack(videoTrack);
              console.log("➕ Added new video track to local preview stream");
              if (!localVideoRef.current.srcObject) localVideoRef.current.srcObject = localStream;
              await localVideoRef.current.play().catch(() => {});
              console.log("▶️ Local video play completed");
              
              // Additional debug: Check the video element state
              setTimeout(() => {
                if (localVideoRef.current) {
                  console.log("🔍 Caller local video element check:");
                  console.log("   - srcObject exists:", !!localVideoRef.current.srcObject);
                  console.log("   - videoWidth:", localVideoRef.current.videoWidth);
                  console.log("   - videoHeight:", localVideoRef.current.videoHeight);
                  console.log("   - readyState:", localVideoRef.current.readyState);
                  console.log("   - paused:", localVideoRef.current.paused);
                  if (localVideoRef.current.srcObject) {
                    const stream = localVideoRef.current.srcObject as MediaStream;
                    console.log("   - stream active:", stream.active);
                    console.log("   - video tracks:", stream.getVideoTracks().length);
                    stream.getVideoTracks().forEach((track, i) => {
                      console.log(`   - track ${i}: enabled=${track.enabled}, readyState=${track.readyState}`);
                    });
                  }
                }
              }, 100);
            } else {
              console.warn("⚠️ Local video ref not available for preview update");
            }
          } catch (err) {
            console.error("Error creating video track for caller:", err);
            videoTrack = null;
          }
        }
        
        // Add the video track to the connection
        if (videoTrack && videoTrack.readyState === "live") {
          const vs = pc.addTrack(videoTrack);
          videoSenderRef.current = vs;
          console.log("Added fresh video track to caller PC", vs);
        }
      } else {
        console.log("📵 Caller: Camera is OFF, NOT adding video track");
      }

      ensureRemoteStream();
      pc.ontrack = (e) => {
        console.log("🎯 Caller received track event!");
        console.log(`📺 Track kind: ${e.track.kind}`);
        console.log("📊 Track settings:", e.track.getSettings());
        console.log("🔄 Track readyState:", e.track.readyState);
        console.log("📡 Stream count:", e.streams.length);
        console.log("🆔 Track ID:", e.track.id);
        
        // Check if this could be a screen share track
        const settings = e.track.getSettings();
        const isLikelyScreenShare = settings.displaySurface !== undefined || 
                                   (settings.width && settings.width > 1920) ||
                                   (settings.height && settings.height > 1080);
        console.log("🖥️ Likely screen share track:", isLikelyScreenShare);
        
        // For screen sharing implementation, we handle all video tracks in the main remote stream
        // The peer will replace their video track with screen share track using replaceTrack
        if (!remoteStreamRef.current) {
          console.log("📺 Creating remote stream for new track");
          remoteStreamRef.current = new MediaStream();
        }
        
        // Remove any existing tracks of the same kind to avoid duplicates
        if (e.track.kind === 'video') {
          const existingVideoTracks = remoteStreamRef.current.getVideoTracks();
          console.log(`🗑️ Removing ${existingVideoTracks.length} existing video tracks`);
          existingVideoTracks.forEach(track => {
            console.log("🗑️ Removing existing video track:", track.id);
            remoteStreamRef.current?.removeTrack(track);
          });
        }
        
        console.log("➕ Adding new track to remote stream");
        remoteStreamRef.current.addTrack(e.track);
        console.log("📊 Total tracks in remote stream:", remoteStreamRef.current.getTracks().length);
        
        // Add track event listeners
        e.track.onended = () => {
          console.log("🔚 Remote track ended:", e.track.id);
        };
        
        e.track.onmute = () => {
          console.log("🔇 Remote track muted:", e.track.id);
        };
        
        e.track.onunmute = () => {
          console.log("🔊 Remote track unmuted:", e.track.id);
        };
        
        ensureRemoteStream(); // Ensure video element has the updated stream
        console.log("✅ Track processing complete");
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
      
      toast.success("Connected!", {
        description: "You've been connected to someone"
      });

      const pc = new RTCPeerConnection();
      receivingPcRef.current = pc;

      // Reset video sender ref for new connection
      videoSenderRef.current = null;

      // Add initial local tracks based on state
      console.log(`🎥 Answerer track setup - camOn: ${camOn}, micOn: ${micOn}`);
      if (localAudioTrack && localAudioTrack.readyState === "live" && micOn) {
        pc.addTrack(localAudioTrack);
        console.log("Added local audio track to answerer PC");
      }
      
      // Handle video track - ensure we have a fresh track if camera is on
      if (camOn) {
        console.log("📹 Answerer: Camera is ON, will add video track");
        let videoTrack = currentVideoTrackRef.current;
        
        // If we don't have a valid video track, create a new one
        if (!videoTrack || videoTrack.readyState === "ended") {
          console.log("Creating new video track for answerer connection");
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoTrack = stream.getVideoTracks()[0];
            currentVideoTrackRef.current = videoTrack;
            console.log("📹 Created new video track:", videoTrack.id, "readyState:", videoTrack.readyState);
            
            // Update local preview with new track
            if (localVideoRef.current) {
              console.log("🎥 Updating local video preview with new track");
              const localStream = localVideoRef.current.srcObject as MediaStream || new MediaStream();
              const oldTracks = localStream.getVideoTracks();
              console.log("🗑️ Removing", oldTracks.length, "old video tracks from local preview");
              localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
              localStream.addTrack(videoTrack);
              console.log("➕ Added new video track to local preview stream");
              if (!localVideoRef.current.srcObject) localVideoRef.current.srcObject = localStream;
              await localVideoRef.current.play().catch(() => {});
              console.log("▶️ Local video play completed");
              
              // Additional debug: Check the video element state
              setTimeout(() => {
                if (localVideoRef.current) {
                  console.log("🔍 Answerer local video element check:");
                  console.log("   - srcObject exists:", !!localVideoRef.current.srcObject);
                  console.log("   - videoWidth:", localVideoRef.current.videoWidth);
                  console.log("   - videoHeight:", localVideoRef.current.videoHeight);
                  console.log("   - readyState:", localVideoRef.current.readyState);
                  console.log("   - paused:", localVideoRef.current.paused);
                  if (localVideoRef.current.srcObject) {
                    const stream = localVideoRef.current.srcObject as MediaStream;
                    console.log("   - stream active:", stream.active);
                    console.log("   - video tracks:", stream.getVideoTracks().length);
                    stream.getVideoTracks().forEach((track, i) => {
                      console.log(`   - track ${i}: enabled=${track.enabled}, readyState=${track.readyState}`);
                    });
                  }
                }
              }, 100);
            } else {
              console.warn("⚠️ Local video ref not available for preview update");
            }
          } catch (err) {
            console.error("Error creating video track for answerer:", err);
            videoTrack = null;
          }
        }
        
        // Add the video track to the connection
        if (videoTrack && videoTrack.readyState === "live") {
          const vs = pc.addTrack(videoTrack);
          videoSenderRef.current = vs;
          console.log("Added fresh video track to answerer PC", vs);
        }
      } else {
        console.log("📵 Answerer: Camera is OFF, NOT adding video track");
      }

      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));

      ensureRemoteStream();
      pc.ontrack = (e) => {
        console.log("🎯 Answerer received track event!");
        console.log(`📺 Track kind: ${e.track.kind}`);
        console.log("📊 Track settings:", e.track.getSettings());
        console.log("🔄 Track readyState:", e.track.readyState);
        console.log("📡 Stream count:", e.streams.length);
        console.log("🆔 Track ID:", e.track.id);
        
        // Check if this could be a screen share track
        const settings = e.track.getSettings();
        const isLikelyScreenShare = settings.displaySurface !== undefined || 
                                   (settings.width && settings.width > 1920) ||
                                   (settings.height && settings.height > 1080);
        console.log("🖥️ Likely screen share track:", isLikelyScreenShare);
        
        // For screen sharing implementation, we handle all video tracks in the main remote stream
        // The peer will replace their video track with screen share track using replaceTrack
        if (!remoteStreamRef.current) {
          console.log("📺 Creating remote stream for new track");
          remoteStreamRef.current = new MediaStream();
        }
        
        // Remove any existing tracks of the same kind to avoid duplicates
        if (e.track.kind === 'video') {
          const existingVideoTracks = remoteStreamRef.current.getVideoTracks();
          console.log(`🗑️ Removing ${existingVideoTracks.length} existing video tracks`);
          existingVideoTracks.forEach(track => {
            console.log("🗑️ Removing existing video track:", track.id);
            remoteStreamRef.current?.removeTrack(track);
          });
        }
        
        console.log("➕ Adding new track to remote stream");
        remoteStreamRef.current.addTrack(e.track);
        console.log("📊 Total tracks in remote stream:", remoteStreamRef.current.getTracks().length);
        
        // Add track event listeners
        e.track.onended = () => {
          console.log("🔚 Remote track ended:", e.track.id);
        };
        
        e.track.onmute = () => {
          console.log("🔇 Remote track muted:", e.track.id);
        };
        
        e.track.onunmute = () => {
          console.log("🔊 Remote track unmuted:", e.track.id);
        };
        
        ensureRemoteStream(); // Ensure video element has the updated stream
        console.log("✅ Track processing complete");
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

    // Renegotiation handlers for when new tracks are added
    s.on("renegotiate-offer", async ({ sdp, role }) => {
      console.log("Received renegotiation offer from", role);
      const pc = receivingPcRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit("renegotiate-answer", { roomId, sdp: answer, role: "answerer" });
      }
    });

    s.on("renegotiate-answer", async ({ sdp, role }) => {
      console.log("Received renegotiation answer from", role);
      const pc = sendingPcRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
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
      console.log("👋 PARTNER LEFT - Preserving states and cleaning up");
      
      toast.warning("Partner Left", {
        description: "Your partner has left the call"
      });
      
      // Get the actual current states - check if we have active tracks, not just the state variables
      const actualCamState = !!(currentVideoTrackRef.current && currentVideoTrackRef.current.readyState === "live" && camOn);
      const actualMicState = !!(localAudioTrack && localAudioTrack.readyState === "live" && micOn);
      
      console.log("🔄 Partner left - State check:");
      console.log("   - camOn state:", camOn);
      console.log("   - currentVideoTrack exists:", !!currentVideoTrackRef.current);
      console.log("   - currentVideoTrack readyState:", currentVideoTrackRef.current?.readyState);
      console.log("   - actual cam state:", actualCamState);
      console.log("   - actual mic state:", actualMicState);
      
      handleNextConnection(actualCamState, actualMicState, "partner-left"); // Preserve actual states when partner leaves
    });

    // peer mic state (optional UI)
    s.on("peer:media-state", ({ state }: { state: { micOn?: boolean; camOn?: boolean } }) => {
      if (typeof state?.micOn === "boolean") setPeerMicOn(state.micOn);
      if (typeof state?.camOn === "boolean") setPeerCamOn(state.camOn);
    });
    s.on("media:mic", ({ on }: { on: boolean }) => setPeerMicOn(!!on));
    s.on("media:cam", ({ on }: { on: boolean }) => setPeerCamOn(!!on));

    // New media state change handlers
    s.on("peer-media-state-change", ({ isScreenSharing, micOn: peerMic, camOn: peerCam, from, userId }) => {
      console.log("🔄 Peer media state changed:", { isScreenSharing, peerMic, peerCam, from, userId });
      console.log("📺 Setting peerScreenShareOn to:", isScreenSharing);
      console.log("🎤 Setting peerMicOn to:", peerMic);
      console.log("📹 Setting peerCamOn to:", peerCam);
      
      if (typeof isScreenSharing === "boolean") {
        setPeerScreenShareOn(isScreenSharing);
        console.log("✅ Updated peerScreenShareOn state to:", isScreenSharing);
      }
      if (typeof peerMic === "boolean") {
        setPeerMicOn(peerMic);
        console.log("✅ Updated peerMicOn state to:", peerMic);
      }
      if (typeof peerCam === "boolean") {
        setPeerCamOn(peerCam);
        console.log("✅ Updated peerCamOn state to:", peerCam);
      }
      
      // Log current remote stream state
      if (remoteStreamRef.current) {
        const videoTracks = remoteStreamRef.current.getVideoTracks();
        const audioTracks = remoteStreamRef.current.getAudioTracks();
        console.log("📡 Current remote stream - Video tracks:", videoTracks.length, "Audio tracks:", audioTracks.length);
        videoTracks.forEach((track, index) => {
          console.log(`📹 Video track ${index}:`, {
            id: track.id,
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState,
            settings: track.getSettings()
          });
        });
      } else {
        console.log("❌ No remote stream available");
      }
      
      // Log remote video element state
      if (remoteVideoRef.current) {
        console.log("🎥 Remote video element:", {
          srcObject: !!remoteVideoRef.current.srcObject,
          videoWidth: remoteVideoRef.current.videoWidth,
          videoHeight: remoteVideoRef.current.videoHeight,
          paused: remoteVideoRef.current.paused,
          currentTime: remoteVideoRef.current.currentTime
        });
      }
    });

    s.on("room-state-update", ({ roomId: rid, users }) => {
      console.log("Room state updated:", rid, users);
      // Handle room state updates if needed for UI
    });

    // Screen share events (legacy - keeping for compatibility)
    s.on("screen:state", ({ on }: { on: boolean }) => setPeerScreenShareOn(!!on));

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
      s.off("renegotiate-offer");
      s.off("renegotiate-answer");
      s.off("lobby");
      s.off("queue:waiting");
      s.off("partner:left");
      s.off("peer:media-state");
      s.off("media:mic");
      s.off("media:cam");
      s.off("peer-media-state-change");
      s.off("room-state-update");
      s.off("screen:state");

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

  function handleNextConnection(currentCamState: boolean, currentMicState: boolean, reason: "next" | "partner-left" = "next") {
    console.log("🔄 HANDLE_NEXT_CONNECTION START:", { currentCamState, currentMicState, reason });
    
    // Clean up peer connections but preserve local tracks and states
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
              receivingPcRef.current?.removeTrack(sn)
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

    // Clean up remote stream only
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
    
    // Clear remote video elements
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

    // Reset peer states but keep our local states (micOn, camOn, screenShareOn)
    setShowChat(false);
    setPeerMicOn(true);
    setPeerCamOn(true);
    setPeerScreenShareOn(false);

    // Clear video sender ref so new connection can set it up properly
    videoSenderRef.current = null;

    // If camera is OFF, ensure we clean up any existing video track immediately
    if (!currentCamState) {
      console.log("🚫 CAMERA OFF - Cleaning up video tracks");
      console.log("📹 Current video track exists:", !!currentVideoTrackRef.current);
      
      if (currentVideoTrackRef.current) {
        try {
          console.log("🛑 Stopping video track:", currentVideoTrackRef.current.id);
          currentVideoTrackRef.current.stop();
          currentVideoTrackRef.current = null;
          console.log("✅ Video track stopped and cleared");
        } catch (err) {
          console.error("❌ Error stopping video track:", err);
        }
      }
      
      // Also clean up local video preview to match the off state
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const ms = localVideoRef.current.srcObject as MediaStream;
        const videoTracks = ms.getVideoTracks();
        console.log("🎥 Local preview video tracks to remove:", videoTracks.length);
        
        for (const t of videoTracks) {
          try {
            console.log("🗑️ Removing video track from preview:", t.id);
            t.stop();
            ms.removeTrack(t);
          } catch (err) {
            console.error("❌ Error stopping local preview track:", err);
          }
        }
        console.log("✅ Local preview cleaned up");
      }
    } else {
      console.log("✅ CAMERA ON - Preserving video track for next connection");
      if (!currentVideoTrackRef.current || currentVideoTrackRef.current.readyState === "ended") {
        console.log("⚠️ Current video track not available, will create new one");
      } else {
        console.log("📹 Video track available:", currentVideoTrackRef.current.id);
      }
    }

    // Return to lobby with appropriate status message
    setLobby(true);
    if (reason === "partner-left") {
      setStatus("Partner left. Finding a new match…");
    } else {
      setStatus("Searching for your next match…");
    }
    
    console.log("🔄 HANDLE_NEXT_CONNECTION END - States preserved:", { camOn: currentCamState, micOn: currentMicState });
  }

const handleNext = () => {
    const s = socketRef.current;
    if (!s) return;

    // Get the actual current states - check if we have active tracks, not just the state variables
    const actualCamState = !!(currentVideoTrackRef.current && currentVideoTrackRef.current.readyState === "live" && camOn);
    const actualMicState = !!(localAudioTrack && localAudioTrack.readyState === "live" && micOn);
    
    console.log("🔄 handleNext called - State check:");
    console.log("   - camOn state:", camOn);
    console.log("   - currentVideoTrack exists:", !!currentVideoTrackRef.current);
    console.log("   - currentVideoTrack readyState:", currentVideoTrackRef.current?.readyState);
    console.log("   - actual cam state:", actualCamState);
    console.log("   - actual mic state:", actualMicState);

    // Clear current remote media immediately for snappy UX
    try {
      remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    s.emit("queue:next");
    handleNextConnection(actualCamState, actualMicState, "next"); // Pass actual states based on track availability
  };


  const handleLeave = () => {
    const s = socketRef.current;
    try {
      s?.emit("queue:leave");
    } catch {}
    
    // Stop screenshare if active
    if (screenShareOn) {
      if (currentScreenShareTrackRef.current) {
        currentScreenShareTrackRef.current.stop();
      }
      if (localScreenShareStreamRef.current) {
        localScreenShareStreamRef.current.getTracks().forEach(t => t.stop());
      }
    }
    
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
      {/* Main Content Area - Videos and Chat */}
      <main className="relative flex-1">
        <div className={`relative mx-auto max-w-[1400px] h-[calc(100vh-80px)] transition-all duration-300 ${
          showChat ? 'px-2 pr-[500px] sm:pr-[500px] md:pr-[540px] lg:pr-[600px]' : 'px-4'
        } pt-4`}>
          
          {/* Screen Share Layout - matches your image exactly */}
          {(peerScreenShareOn || screenShareOn) ? (
            <div className="flex flex-col h-full gap-4">
              {/* Top: Two small videos side by side */}
              <div className="flex gap-4 justify-center">
                {/* My Video */}
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)] w-64 aspect-video">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {!camOn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <IconUser className="h-8 w-8 text-white/70" />
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-xs">
                    <span>{name || "You"}</span>
                  </div>
                </div>

                {/* Peer Video */}
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)] w-64 aspect-video">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {!peerCamOn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <IconUser className="h-8 w-8 text-white/70" />
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-xs">
                    <span>Peer</span>
                    {!peerMicOn && (
                      <IconMicrophoneOff className="h-3 w-3 ml-1 inline" />
                    )}
                  </div>
                </div>
              </div>

              {/* Center: Large Screen Share */}
              <div className="flex-1 relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                {screenShareOn && (
                  <video
                    ref={localScreenShareRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
                {peerScreenShareOn && !screenShareOn && (
                  <video
                    ref={remoteScreenShareRef}
                    autoPlay
                    playsInline
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
                <div className="absolute bottom-4 left-4 rounded-md bg-black/60 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <IconScreenShare className="h-4 w-4" />
                    {screenShareOn ? "Your Screen Share" : "Peer's Screen Share"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Regular Video Grid - when not screen sharing */
            <div className={`grid gap-4 h-full transition-all duration-300 ${
              showChat 
                ? 'grid-cols-1 grid-rows-2 max-w-none' 
                : 'grid-cols-1 sm:grid-cols-2 grid-rows-1'
            }`}>
              {/* Remote/Peer Video */}
              <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)] ${
                showChat ? 'aspect-[4/3] max-w-2xl mx-auto' : ''
              }`}>
                {/* Video container with proper aspect ratio */}
                <div className={`relative w-full ${
                  showChat ? 'h-full' : 'h-full min-h-0'
                }`}>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`absolute inset-0 h-full w-full ${
                      peerScreenShareOn ? 'object-contain' : 
                      showChat ? 'object-cover' : 'object-cover'
                    }`}
                  />

                  {/* Lobby overlay only */}
                  {lobby && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                      <IconLoader2 className="h-10 w-10 animate-spin text-white/70" />
                      <span className="text-sm text-white/70">{status}</span>
                    </div>
                  )}
                  
                  {!peerCamOn && !lobby && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <IconUser className="h-12 w-12 text-white/70" />
                    </div>
                  )}
                  
                  {/* Remote label with mic badge and screen share indicator */}
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs">
                    <span>{lobby ? "—" : "Peer"}</span>
                    {!lobby && !peerMicOn && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded bg-red-600/80 px-1.5 py-0.5">
                        <IconMicrophoneOff className="h-3 w-3" />
                        <span>muted</span>
                      </span>
                    )}
                    {peerScreenShareOn && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded bg-blue-600/80 px-1.5 py-0.5">
                        <IconScreenShare className="h-3 w-3" />
                        <span>sharing</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Local/Your Video */}
              <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)] ${
                showChat ? 'aspect-[4/3] max-w-2xl mx-auto' : ''
              }`}>
                <div className={`relative w-full ${
                  showChat ? 'h-full' : 'h-full min-h-0'
                }`}>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 h-full w-full ${
                      showChat ? 'object-cover' : 'object-cover'
                    }`}
                  />
                  
                  {!camOn && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                      <IconUser className="h-12 w-12 text-white/70" />
                    </div>
                  )}
                  
                  {/* Local label with screen share indicator */}
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1 text-xs">
                    <span>{name || "You"}</span>
                    {screenShareOn && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded bg-blue-600/80 px-1.5 py-0.5">
                        <IconScreenShare className="h-3 w-3" />
                        <span>sharing</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hidden remote audio */}
          <audio ref={remoteAudioRef} style={{ display: "none" }} />
        </div>

        {/* Chat Drawer - confined to main content area */}
        <div
          className={`fixed top-4 right-0 bottom-20 w-full sm:w-[500px] md:w-[540px] lg:w-[600px] transform border border-white/10 border-r-0 bg-neutral-950 backdrop-blur transition-transform duration-300 rounded-l-2xl ${
            showChat ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-full">
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

      {/* Controls Area - Always visible and separate */}
      <div className="fixed bottom-0 left-0 right-0 h-20 z-50">
        <div className="relative h-full flex items-center justify-center">
          {/* Bottom controls */}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-2 py-1.5 backdrop-blur">
            <button
              onClick={handleRecheck}
              className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              title="Recheck"
            >
              <IconRefresh className="h-5 w-5" />
            </button>

            <button
              onClick={toggleMic}
              className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                micOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-500"
              }`}
              title={micOn ? "Turn off microphone" : "Turn on microphone"}
            >
              {micOn ? <IconMicrophone className="h-5 w-5" /> : <IconMicrophoneOff className="h-5 w-5" />}
            </button>

            <button
              onClick={toggleCam}
              className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                camOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-500"
              }`}
              title={camOn ? "Turn off camera" : "Turn on camera"}
            >
              {camOn ? <IconVideo className="h-5 w-5" /> : <IconVideoOff className="h-5 w-5" />}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                screenShareOn ? "bg-blue-600 hover:bg-blue-500" : "bg-white/10 hover:bg-white/20"
              }`}
              title={screenShareOn ? "Stop screen share" : "Start screen share"}
            >
              {screenShareOn ? <IconScreenShareOff className="h-5 w-5" /> : <IconScreenShare className="h-5 w-5" />}
            </button>

            <button
              onClick={handleNext}
              className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              title="Next match"
            >
              <IconPlayerSkipForward className="h-5 w-5" />
            </button>

            <button
              onClick={handleLeave}
              className="ml-1 mr-1 h-11 rounded-full bg-red-600 px-6 hover:bg-red-500 flex items-center justify-center gap-2"
              title="Leave call"
            >
              <IconPhoneOff className="h-5 w-5" />
              <span className="hidden sm:inline text-sm font-medium">Leave</span>
            </button>
          </div>

          {/* Right side controls - positioned within controls area */}
          <div className="absolute right-6">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-2 py-1.5 backdrop-blur">
              <button
                onClick={() => setShowChat((v) => !v)}
                className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                  showChat ? "bg-indigo-600 hover:bg-indigo-500" : "bg-white/10 hover:bg-white/20"
                }`}
                title={showChat ? "Close chat" : "Open chat"}
              >
                <IconMessage className="h-5 w-5" />
              </button>
              
              <button
                onClick={() => {/* Add report functionality */}}
                className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Report user"
              >
                <IconFlag className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
