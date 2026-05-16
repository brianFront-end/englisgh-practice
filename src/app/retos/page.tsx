"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { TopicId } from "@/components/TopicSelector";

type ChallengeTopic = {
  id: TopicId;
  title: string;
  description: string;
  image: string;
  difficulty: "easy" | "medium" | "hard";
  listening: {
    text: string;
    question: string;
    options: string[];
    explanations: string[];
    answer: number;
  };
};

const CHALLENGES: ChallengeTopic[] = [
  {
    id: "frontend_interview",
    title: "Frontend Interview",
    description: "Talk like a real frontend engineer in interviews.",
    image: "/topics/frontend.svg",
    difficulty: "hard",
    listening: {
      text: "Yesterday I refactored our component tree, extracted reusable hooks, and reduced render time by twenty percent.",
      question: "What was the main outcome?",
      options: ["More bugs", "Better render performance", "Deleted the project"],
      explanations: [
        "Incorrect: the sentence says performance improved, not bugs.",
        "Correct: it explicitly says render time was reduced by 20%.",
        "Incorrect: there is no mention of deleting the project.",
      ],
      answer: 1,
    },
  },
  {
    id: "daily_challenge_api_yesterday",
    title: "API Yesterday",
    description: "Say clearly that you built and finished an API yesterday.",
    image: "/topics/api.svg",
    difficulty: "medium",
    listening: {
      text: "I finished the API yesterday, added authentication middleware, and documented every endpoint for the frontend team.",
      question: "What extra task was completed besides coding?",
      options: ["Database migration", "Endpoint documentation", "UI design"],
      explanations: [
        "Incorrect: migration is never mentioned.",
        "Correct: it says every endpoint was documented.",
        "Incorrect: UI design is unrelated to the sentence.",
      ],
      answer: 1,
    },
  },
  {
    id: "daily_english",
    title: "Daily Standup",
    description: "Practice daily updates in English.",
    image: "/topics/standup.svg",
    difficulty: "easy",
    listening: {
      text: "Yesterday I completed the login flow. Today I will integrate payments. I am blocked by missing sandbox credentials.",
      question: "What is the blocker?",
      options: ["No internet", "Missing sandbox credentials", "Broken laptop"],
      explanations: [
        "Incorrect: internet issues were not mentioned.",
        "Correct: missing sandbox credentials was the blocker.",
        "Incorrect: no laptop issue appears in the audio.",
      ],
      answer: 1,
    },
  },
  {
    id: "free_talk",
    title: "Free Tech Talk",
    description: "Choose any dev topic and keep flow naturally.",
    image: "/topics/free-talk.svg",
    difficulty: "medium",
    listening: {
      text: "I prefer integration tests for critical flows because they validate real behavior between modules.",
      question: "Why does the speaker prefer integration tests?",
      options: ["They are faster to write always", "They validate real behavior between modules", "Unit tests are impossible"],
      explanations: [
        "Incorrect: speed was not the stated reason.",
        "Correct: that phrase is explicitly in the sentence.",
        "Incorrect: unit tests were not called impossible.",
      ],
      answer: 1,
    },
  },
];

function randomizeOptions(options: string[]) {
  const next = [...options];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export default function RetosPage() {
  const [active, setActive] = useState<TopicId>(CHALLENGES[0].id);
  const [isRolling, setIsRolling] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [quizSet, setQuizSet] = useState<ChallengeTopic[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedListeningAnswer, setSelectedListeningAnswer] = useState<number | null>(null);
  const [isValidated, setIsValidated] = useState(false);
  const [isPlayingListening, setIsPlayingListening] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [difficultyLevel, setDifficultyLevel] = useState<"easy" | "medium" | "hard">("medium");
  const [streakSignal, setStreakSignal] = useState(0);

  const current = useMemo(() => {
    if (quizSet.length > 0) {
      return quizSet[questionIndex] ?? quizSet[0];
    }
    return CHALLENGES.find((item) => item.id === active) ?? CHALLENGES[0];
  }, [active, questionIndex, quizSet]);

  const percentage = quizSet.length > 0 ? Math.round((correctCount / quizSet.length) * 100) : 0;
  const isQuizFinished = quizSet.length > 0 && questionIndex >= quizSet.length;

  const currentCorrectOption = useMemo(() => {
    if (!shuffledOptions.length || isQuizFinished) return "";
    return current.listening.options[current.listening.answer] ?? "";
  }, [current, shuffledOptions, isQuizFinished]);

  const playListening = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isPlayingListening) {
      window.speechSynthesis.cancel();
      setIsPlayingListening(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(current.listening.text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.onend = () => setIsPlayingListening(false);
    utterance.onerror = () => setIsPlayingListening(false);
    window.speechSynthesis.cancel();
    setIsPlayingListening(true);
    window.speechSynthesis.speak(utterance);
  };

  const rollChallenge = () => {
    setIsRolling(true);
    setSelectedListeningAnswer(null);
    setIsValidated(false);

    window.setTimeout(() => {
      const preferred = CHALLENGES.filter((item) => item.difficulty === difficultyLevel);
      const source = preferred.length > 0 ? preferred : CHALLENGES;
      const shuffled = [...source, ...CHALLENGES].sort(() => Math.random() - 0.5);
      const generated = [...shuffled, ...CHALLENGES].slice(0, 5);
      setQuizSet(generated);
      setQuestionIndex(0);
      setCorrectCount(0);
      setActive(generated[0].id);
      setShuffledOptions(randomizeOptions(generated[0].listening.options));
      setIsRolling(false);
      setIsModalOpen(true);
    }, 900);
  };

  const handleValidate = () => {
    if (selectedListeningAnswer === null || isValidated) return;
    setIsValidated(true);
    const selectedOption = shuffledOptions[selectedListeningAnswer];
    if (selectedOption === currentCorrectOption) {
      setCorrectCount((prev) => prev + 1);
      setStreakSignal((prev) => Math.min(3, prev + 1));
      if (streakSignal + 1 >= 2) {
        setDifficultyLevel((prev) => (prev === "easy" ? "medium" : "hard"));
      }
    } else {
      setStreakSignal((prev) => Math.max(-3, prev - 1));
      if (streakSignal - 1 <= -2) {
        setDifficultyLevel((prev) => (prev === "hard" ? "medium" : "easy"));
      }
    }
  };

  const handleNextQuestion = () => {
    if (!quizSet.length) return;
    setSelectedListeningAnswer(null);
    setIsValidated(false);
    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex);
    const nextQuestion = quizSet[nextIndex];
    if (nextQuestion) {
      setShuffledOptions(randomizeOptions(nextQuestion.listening.options));
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f7] px-4 py-10">
      <main className="mx-auto w-full max-w-5xl">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#58cc02]">Retos</p>
            <h1 className="text-3xl font-extrabold text-zinc-900">Programming Topics</h1>
          </div>
          <Link href="/" className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-zinc-800 ring-2 ring-zinc-300">
            ← Back
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {CHALLENGES.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => {
                setActive(topic.id);
                setSelectedListeningAnswer(null);
                setIsValidated(false);
                const generated = [topic, ...CHALLENGES.filter((item) => item.id !== topic.id).slice(0, 4)];
                setQuizSet(generated);
                setQuestionIndex(0);
                setCorrectCount(0);
                setShuffledOptions(randomizeOptions(topic.listening.options));
                setIsModalOpen(true);
              }}
              className={`overflow-hidden rounded-2xl border-2 bg-white text-left transition ${
                active === topic.id ? "border-[#58cc02]" : "border-zinc-200"
              }`}
            >
              <Image src={topic.image} alt={topic.title} width={720} height={320} className="h-40 w-full object-cover" />
              <div className="p-4">
                <h2 className="font-bold text-zinc-900">{topic.title}</h2>
                <p className="mt-1 text-sm text-zinc-900">{topic.description}</p>
              </div>
            </button>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border-2 border-zinc-200 bg-white p-6 text-center">
          <p className="text-sm text-zinc-900">Reto aleatorio de listening</p>
          <p className="mt-1 text-xs text-zinc-600">Difficulty: <span className="font-semibold text-zinc-800">{difficultyLevel}</span></p>
          <motion.button
            type="button"
            onClick={rollChallenge}
            disabled={isRolling}
            whileTap={{ scale: 0.94 }}
            animate={isRolling ? { rotate: [0, 18, -18, 10, -10, 0] } : { rotate: 0 }}
            transition={{ duration: 0.9 }}
            className="mx-auto mt-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#58cc02] text-white shadow-lg"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-10 w-10 fill-current">
              <path d="M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7Zm6 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
            </svg>
          </motion.button>
          <p className="mt-3 text-xs text-zinc-900">{isRolling ? "Rolling..." : "Tap the dice"}</p>
        </section>

        <AnimatePresence>
          {isModalOpen ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            >
              <motion.section
                initial={{ scale: 0.88, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.92, y: 18, opacity: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 20 }}
                className="w-full max-w-xl overflow-hidden rounded-3xl border-2 border-zinc-200 bg-white shadow-2xl"
              >
                <Image src={current.image} alt={current.title} width={800} height={300} className="h-40 w-full object-cover" />

                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold text-zinc-900">
                      {isQuizFinished ? "Resultado final" : `Listening ${questionIndex + 1}/5: ${current.title}`}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined" && "speechSynthesis" in window) {
                          window.speechSynthesis.cancel();
                        }
                        setIsPlayingListening(false);
                        setIsModalOpen(false);
                      }}
                      className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-bold text-black"
                    >
                      Close
                    </button>
                  </div>

                  {isQuizFinished ? (
                    <div className="mt-4">
                      <p className="text-sm font-bold text-zinc-900">Aciertos: {correctCount} / 5</p>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-200">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full bg-[#58cc02]"
                        />
                      </div>
                      <p className="mt-2 text-lg font-extrabold text-zinc-900">{percentage}%</p>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={playListening}
                        className="mt-3 rounded-xl bg-[#58cc02] px-4 py-2 text-sm font-bold text-white"
                      >
                        {isPlayingListening ? "⏹ Stop audio" : "▶ Play audio"}
                      </button>

                      <p className="mt-4 text-sm text-zinc-900">{current.listening.question}</p>

                      <div className="mt-3 space-y-2">
                        {shuffledOptions.map((option, index) => {
                          const isSelected = selectedListeningAnswer === index;
                          const isCorrect = option === currentCorrectOption;
                          const showCorrect = isValidated && isCorrect;
                          const showWrong = isValidated && isSelected && !isCorrect;

                          return (
                            <motion.button
                              key={option}
                              type="button"
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                if (!isValidated) setSelectedListeningAnswer(index);
                              }}
                              className={`w-full rounded-xl border px-3 py-2 text-left text-sm text-zinc-900 ${
                                showCorrect
                                  ? "border-[#58cc02] bg-[#f1ffe8]"
                                  : showWrong
                                    ? "border-red-300 bg-red-50"
                                    : isSelected
                                      ? "border-blue-400 bg-blue-50"
                                      : "border-zinc-300"
                              }`}
                            >
                              <span className="mr-2 font-bold">{String.fromCharCode(65 + index)}.</span>
                              {option}
                            </motion.button>
                          );
                        })}
                      </div>

                      {isValidated && selectedListeningAnswer !== null ? (
                        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-left text-xs text-zinc-700">
                          <p className="font-semibold text-zinc-800">Explanation</p>
                          <p className="mt-1">
                            {
                              current.listening.explanations[
                                current.listening.options.findIndex((opt) => opt === shuffledOptions[selectedListeningAnswer])
                              ] ?? "Review the sentence and compare key words."
                            }
                          </p>
                        </div>
                      ) : null}

                      <div className="mt-4 flex items-center justify-end gap-2">
                        {!isValidated ? (
                          <button
                            type="button"
                            onClick={handleValidate}
                            disabled={selectedListeningAnswer === null}
                            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Validar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleNextQuestion}
                            className="rounded-xl bg-[#58cc02] px-4 py-2 text-sm font-bold text-white"
                          >
                            {questionIndex === 4 ? "Ver resultado" : "Siguiente"}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </motion.section>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}
