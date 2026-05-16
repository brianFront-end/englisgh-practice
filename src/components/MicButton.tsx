"use client";

type MicButtonProps = {
  isListening: boolean;
  isSupported: boolean;
  level?: number;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
};

export default function MicButton({
  isListening,
  isSupported,
  level = 0,
  onStart,
  onStop,
  disabled = false,
}: MicButtonProps) {
  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        aria-label="Microphone not supported"
        className="rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      >
        <span aria-hidden>🎤</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={isListening ? onStop : onStart}
      disabled={disabled}
      aria-label={isListening ? "Stop microphone" : "Start microphone"}
      className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isListening ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
      }`}
    >
      {isListening ? (
        <>
          <span
            className="absolute inset-0 rounded-xl bg-white/25"
            style={{
              transform: `scale(${1 + Math.min(level, 1) * 0.6})`,
              opacity: 0.25 + Math.min(level, 1) * 0.45,
              transition: "transform 80ms linear, opacity 80ms linear",
            }}
          />
          <svg aria-hidden viewBox="0 0 24 24" className="relative h-5 w-5 fill-current">
            <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm7-4a1 1 0 1 0-2 0 5 5 0 1 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z" />
          </svg>
        </>
      ) : (
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
          <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm7-4a1 1 0 1 0-2 0 5 5 0 1 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z" />
        </svg>
      )}
    </button>
  );
}
