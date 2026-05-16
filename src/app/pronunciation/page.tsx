"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

declare global {
  interface Window {
    webkitSpeechRecognition?: {
      new (): SpeechRecognition;
    };
  }
}

type Drill = {
  id: string;
  label: string;
  target: string;
  tip: string;
};

const DRILLS: Drill[] = [
  {
    id: "th-sound",
    label: "TH sound",
    target: "Thank you for the thorough feedback.",
    tip: "Put your tongue lightly between your teeth for 'th'.",
  },
  {
    id: "v-sound",
    label: "V sound",
    target: "We have delivered a very valuable update.",
    tip: "Use upper teeth on lower lip for 'v'.",
  },
  {
    id: "ed-ending",
    label: "Past tense -ed",
    target: "Yesterday I finished, tested, and deployed the API.",
    tip: "Mark every past verb ending clearly.",
  },
  {
    id: "frontend-pitch",
    label: "Frontend pitch",
    target: "I built a scalable frontend architecture with reusable components.",
    tip: "Stress keywords: scalable, architecture, reusable.",
  },
];

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function buildCorrectiveExercises(target: string, transcript: string) {
  const tWords = normalize(target).split(" ").filter(Boolean);
  const sWords = new Set(normalize(transcript).split(" ").filter(Boolean));
  const missed = tWords.filter((w) => !sWords.has(w));

  const exercises: string[] = [];
  if (missed.some((w) => w.includes("th"))) {
    exercises.push("Repeat slowly 5 times: this, think, thorough, thank.");
  }
  if (missed.some((w) => w.includes("v"))) {
    exercises.push("Repeat slowly 5 times: very, value, develop, move.");
  }
  if (missed.some((w) => w.endsWith("ed"))) {
    exercises.push("Practice past endings: finished, tested, deployed, improved.");
  }
  if (missed.length > 0) {
    exercises.push(`Shadow the sentence 3 times and focus on: ${missed.slice(0, 5).join(", ")}.`);
  }
  if (exercises.length === 0) {
    exercises.push("Great pronunciation. Increase speed slightly and repeat 3 times.");
  }

  return exercises;
}

export default function PronunciationPage() {
  const [selectedId, setSelectedId] = useState(DRILLS[0].id);
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => DRILLS.find((d) => d.id === selectedId) ?? DRILLS[0], [selectedId]);

  const score = useMemo(() => {
    if (!transcript.trim()) return 0;
    const targetWords = normalize(selected.target).split(" ").filter(Boolean);
    const spokenWords = new Set(normalize(transcript).split(" ").filter(Boolean));
    const matched = targetWords.filter((w) => spokenWords.has(w)).length;
    return Math.round((matched / Math.max(1, targetWords.length)) * 100);
  }, [selected.target, transcript]);

  const exercises = useMemo(
    () => buildCorrectiveExercises(selected.target, transcript),
    [selected.target, transcript],
  );

  const startRecognition = () => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setError("Microphone error. Check browser permissions.");
    };

    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setTranscript(spoken);
    };

    recognition.start();
  };

  return (
    <div className="min-h-screen bg-[#f7f7f7] px-4 py-10">
      <main className="mx-auto w-full max-w-4xl space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#58cc02]">Pronunciation Lab</p>
            <h1 className="text-3xl font-extrabold text-zinc-900">Word & phoneme coaching</h1>
          </div>
          <Link href="/" className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">
            Back
          </Link>
        </header>

        <section className="rounded-2xl border-2 border-zinc-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-zinc-800">Choose drill</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DRILLS.map((drill) => (
              <button
                key={drill.id}
                type="button"
                onClick={() => setSelectedId(drill.id)}
                className={`rounded-xl border p-3 text-left ${
                  selectedId === drill.id ? "border-[#58cc02] bg-[#f1ffe8]" : "border-zinc-200 bg-zinc-50"
                }`}
              >
                <p className="font-semibold text-zinc-900">{drill.label}</p>
                <p className="text-xs text-zinc-600">{drill.tip}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border-2 border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-600">Target sentence</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">{selected.target}</p>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={startRecognition}
              disabled={isListening}
              className="rounded-xl bg-[#58cc02] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {isListening ? "Listening..." : "Start pronunciation check"}
            </button>
            <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              Score: <span className="font-bold text-zinc-900">{score}%</span>
            </div>
          </div>

          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold text-zinc-700">Your transcript</p>
            <p className="mt-1 text-sm text-zinc-900">{transcript || "No speech captured yet."}</p>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-sm font-semibold text-zinc-800">Automatic corrective exercises</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {exercises.map((ex) => (
                <li key={ex}>{ex}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
