"use client";
import { useEffect, useRef, useState } from "react";
import Room from "./Room";

export default function DeviceCheck() {
  const [name, setName] = useState("");
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);

  const getCam = async () => {
    setError(null);
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
      setError(e?.message || "Could not access camera/microphone");
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
    <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl rounded-2xl border bg-white/60 backdrop-blur shadow-lg p-6 md:p-8 dark:bg-gray-900/70 dark:border-gray-800">
        <h1 className="text-2xl font-semibold mb-1">Device check</h1>
        <p className="text-sm text-gray-500 mb-6">
          Preview your camera & mic before joining a match.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Video preview */}
          <div>
            <div className="aspect-video w-full overflow-hidden rounded-xl border bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVideoOn((v) => !v)}
                className={`px-3 py-2 text-sm rounded-lg border transition ${
                  videoOn
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-white"
                }`}
              >
                {videoOn ? "Turn camera off" : "Turn camera on"}
              </button>
              <button
                type="button"
                onClick={() => setAudioOn((a) => !a)}
                className={`px-3 py-2 text-sm rounded-lg border transition ${
                  audioOn
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-white"
                }`}
              >
                {audioOn ? "Mute mic" : "Unmute mic"}
              </button>
              <button
                type="button"
                onClick={getCam}
                className="px-3 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                Re-check
              </button>
            </div>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>

          {/* Join form */}
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Display name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Jayanth"
                className="mt-1 h-11 w-full rounded-lg border px-4 text-sm bg-white dark:bg-gray-900 dark:text-white dark:border-gray-800"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {["React", "Node", "DevOps", "Python", "ML", "TypeScript"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className="px-3 py-1.5 text-xs rounded-full border hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setJoined(true)}
              disabled={!name}
              className="w-full h-11 rounded-lg bg-gray-900 text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
            >
              Join match
            </button>

            <p className="text-xs text-gray-500">
              You can change camera/mic after joining too.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
