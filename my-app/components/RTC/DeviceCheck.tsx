"use client";
import { useEffect, useRef, useState } from "react";
import Room from "./Room";
import { toast } from "sonner";
import { 
  IconMicrophone,
  IconMicrophoneOff,
  IconVideo,
  IconVideoOff,
  IconRefresh,
  IconUser
} from "@tabler/icons-react";

export default function DeviceCheck() {
  const [name, setName] = useState("");
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [joined, setJoined] = useState(false);
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);

  const getCam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoOn,
        audio: audioOn,
      });
      const audioTrack = stream.getAudioTracks()[0] || null;
      const videoTrack = stream.getVideoTracks()[0] || null;
      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);

      if (videoRef.current) {
        videoRef.current.srcObject = videoTrack ? new MediaStream([videoTrack]) : null;
        if (videoTrack) await videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      const errorMessage = e?.message || "Could not access camera/microphone";
      toast.error("Device Access Error", {
        description: errorMessage
      });
    }
  };

  useEffect(() => {
    getCam();
    // cleanup: stop tracks on unmount
    return () => {
      [localAudioTrack, localVideoTrack].forEach((t) => t?.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-init on toggles
  useEffect(() => {
    getCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoOn, audioOn]);

  if (joined) {
    return (
      <Room
        name={name}
        localAudioTrack={localAudioTrack}
        localVideoTrack={localVideoTrack}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6 py-8">
      {/* Main centered container */}
      <div className="w-full max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Ready to connect?</h1>
          <p className="text-neutral-400 text-lg">Check your camera and microphone before joining</p>
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          
          {/* Left Side - Video Preview */}
          <div className="space-y-6">
            {/* Video preview container - rounded */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
              <div className="aspect-video w-full bg-black relative">
                {videoOn ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <IconUser className="h-16 w-16 text-white/70" />
                  </div>
                )}
                
                {/* Status indicators */}
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <div className="rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                    <span>{name || "You"}</span>
                  </div>
                  {!audioOn && (
                    <span className="inline-flex items-center gap-1 rounded bg-red-600/80 px-1.5 py-0.5 text-xs text-white">
                      <IconMicrophoneOff className="h-3 w-3" />
                      <span>muted</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Control buttons below video */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setAudioOn((a) => !a)}
                className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                  audioOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-500"
                }`}
                title={audioOn ? "Turn off microphone" : "Turn on microphone"}
              >
                {audioOn ? <IconMicrophone className="h-5 w-5 text-white" /> : <IconMicrophoneOff className="h-5 w-5 text-white" />}
              </button>

              <button
                onClick={() => setVideoOn((v) => !v)}
                className={`h-11 w-11 rounded-full flex items-center justify-center transition ${
                  videoOn ? "bg-white/10 hover:bg-white/20" : "bg-red-600 hover:bg-red-500"
                }`}
                title={videoOn ? "Turn off camera" : "Turn on camera"}
              >
                {videoOn ? <IconVideo className="h-5 w-5 text-white" /> : <IconVideoOff className="h-5 w-5 text-white" />}
              </button>

              <button
                onClick={getCam}
                className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                title="Refresh devices"
              >
                <IconRefresh className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Right Side - Join Form */}
          <div className="space-y-6">
            <div className="p-8 rounded-2xl border border-white/10 bg-neutral-900/50 backdrop-blur shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-white mb-6">Join the conversation</h2>
                  
                  <label className="block text-sm font-medium text-white mb-3">
                    What should we call you?
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full h-12 px-4 rounded-xl border border-white/10 bg-neutral-800/50 text-white placeholder-neutral-500 focus:border-white/30 focus:outline-none transition-colors backdrop-blur"
                  />
                </div>

                <button
                  onClick={() => setJoined(true)}
                  disabled={!name.trim()}
                  className="w-full h-12 bg-white text-black rounded-xl font-medium hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 disabled:hover:bg-white"
                >
                  Join Meeting
                </button>

                <p className="text-xs text-neutral-500 text-center">
                  By joining, you agree to our terms of service and privacy policy
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
