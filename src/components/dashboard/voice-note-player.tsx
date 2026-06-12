"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2 } from "lucide-react";

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type VoiceNotePlayerProps = {
  src: string;
  durationMs?: number | null;
};

export function VoiceNotePlayer({ src, durationMs }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const player = audio;

    function syncTime() {
      setCurrentTime(player.currentTime);
    }

    function syncDuration() {
      if (Number.isFinite(player.duration)) {
        setDuration(player.duration);
      }
    }

    function finishPlayback() {
      setIsPlaying(false);
      setIsLoading(false);
      setCurrentTime(0);
    }

    function stopLoading() {
      setIsLoading(false);
    }

    function startLoading() {
      setIsLoading(true);
    }

    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("loadedmetadata", syncDuration);
    audio.addEventListener("ended", finishPlayback);
    audio.addEventListener("playing", stopLoading);
    audio.addEventListener("waiting", startLoading);

    return () => {
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("loadedmetadata", syncDuration);
      audio.removeEventListener("ended", finishPlayback);
      audio.removeEventListener("playing", stopLoading);
      audio.removeEventListener("waiting", startLoading);
    };
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      setIsLoading(true);

      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsLoading(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div className="flex min-w-[15rem] items-center gap-2 rounded-lg border border-ink/10 bg-white/80 px-2 py-2 sm:min-w-[18rem]">
      <audio ref={audioRef} preload="metadata" src={src} />
      <button
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss text-white transition hover:bg-[#185747]"
        type="button"
        onClick={togglePlayback}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="ml-0.5 h-4 w-4" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <input
          aria-label="Voice note progress"
          className="h-1.5 w-full cursor-pointer accent-[#1F6F5B]"
          max={Math.max(duration, 0.1)}
          min={0}
          step={0.1}
          type="range"
          value={Math.min(currentTime, duration || currentTime)}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink/50">
          <span>{formatDuration(currentTime * 1000)}</span>
          <span className="inline-flex items-center gap-1">
            <Volume2 className="h-3 w-3" />
            {formatDuration(duration * 1000)}
          </span>
        </div>
      </div>
    </div>
  );
}
