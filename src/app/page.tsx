"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopicSelector, { type TopicId, type TopicOption } from "@/components/TopicSelector";
import { motion } from "framer-motion";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import confetti from "canvas-confetti";

declare global {
  interface Window {
    webkitSpeechRecognition?: {
      new (): SpeechRecognition;
    };
  }
}

const TOPICS: TopicOption[] = [
  {
    id: "frontend_interview",
    label: "Frontend Technical Interview",
    description:
      "Practice interview questions about React, JavaScript, architecture, and communication.",
  },
  {
    id: "free_talk",
    label: "Free Talk",
    description: "Talk about any topic and keep the conversation natural and open.",
  },
  {
    id: "daily_english",
    label: "Daily English",
    description: "Practice natural daily conversations: routines, plans, and small talk.",
  },
  {
    id: "daily_challenge_api_yesterday",
    label: "Challenge: API Yesterday",
    description: "Practice saying you built an API yesterday and finished it with confidence.",
  },
];

const AVAILABLE_MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct", label: "NVIDIA Nemotron 70B" },
  { id: "meta/llama-3.1-70b-instruct", label: "NVIDIA Meta Llama 3.1 70B" },
  { id: "meta/llama-3.1-8b-instruct", label: "NVIDIA Meta Llama 3.1 8B" },
  { id: "meta/llama-3.2-3b-instruct", label: "NVIDIA Meta Llama 3.2 3B" },
  { id: "meta/llama-3.2-1b-instruct", label: "NVIDIA Meta Llama 3.2 1B" },
  { id: "mistralai/mixtral-8x7b-instruct-v0.1", label: "NVIDIA Mixtral 8x7B" },
  { id: "mistralai/mistral-7b-instruct-v0.3", label: "NVIDIA Mistral 7B" },
  { id: "qwen/qwen2.5-72b-instruct", label: "NVIDIA Qwen2.5 72B" },
  { id: "qwen/qwen2.5-7b-instruct", label: "NVIDIA Qwen2.5 7B" },
  { id: "microsoft/phi-3-medium-128k-instruct", label: "NVIDIA Phi-3 Medium" },
  { id: "google/gemma-2-9b-it", label: "NVIDIA Gemma 2 9B" },
  { id: "google/gemma-2-27b-it", label: "NVIDIA Gemma 2 27B" },
  { id: "groq/llama-3.1-8b-instant", label: "Groq Llama 3.1 8B Instant" },
  { id: "groq/llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B Versatile" },
  { id: "groq/mixtral-8x7b-32768", label: "Groq Mixtral 8x7B" },
  { id: "groq/gemma2-9b-it", label: "Groq Gemma2 9B" },
] as const;

type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];
type LearnerLevel = "beginner" | "intermediate" | "advanced";
type CoachingMode = "coaching" | "exam";
type ModalTab = "chat" | "settings" | "info";
type VoiceUiState = "idle" | "listening" | "thinking" | "speaking";

type ChatMessage = { role: "user" | "assistant"; text: string };
type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  pinned?: boolean;
  messages: ChatMessage[];
};

type ParsedAssistantMessage = {
  main: string;
  correctionEs?: string;
  correctionEn?: string;
  betterWay?: string;
  glossaryTerm?: string;
  glossaryType?: string;
  glossaryMeaningEs?: string;
  glossaryExample?: string;
  sentenceTranslationsEs?: string[];
};

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `session-${crypto.randomUUID()}`;
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CHAT_FEATURES_MARKDOWN = `# Chat Features

## Core
- Conversational English practice by topic
- Voice input (Speech-to-Text)
- Voice playback (Text-to-Speech)
- Audio Pro toggle (Google TTS)
- AI model selector (Gemini / NVIDIA / Groq)

## Learning Support
- Sentence-by-sentence translation toggle
- Feedback only when needed
- Better phrasing suggestions
- Glossary with meaning and example

## Session & UX
- Multi-session chat history
- Pin and search chats
- New chat resets active context
- Responsive modal (mobile + desktop)

## Progress
- Turns, corrections, and accuracy
- Daily goal progress bar
- Voice activity timeline
- Last model used indicator
`;

const QUICK_REPLY_CHIPS = [
  "Can you repeat that?",
  "Could you speak more slowly, please?",
  "Can you correct my last answer?",
  "Give me a better way to say this.",
  "Let's do a mock interview answer.",
  "Can you ask me a follow-up question?",
] as const;

function splitMainSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeForCompare(text: string) {
  return text
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSentences(sentences: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const sentence of sentences) {
    const key = normalizeForCompare(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(sentence);
  }

  return result;
}

function cleanTranslationCandidate(raw: string, sourceSentence: string) {
  const value = raw.trim();
  if (!value) return "";

  const separatorMatch = value.match(/\s*(?:->|→)\s*/);
  if (!separatorMatch) return value;

  const parts = value.split(/\s*(?:->|→)\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return value;

  const sourceKey = normalizeForCompare(sourceSentence);
  const leftKey = normalizeForCompare(parts[0]);
  const right = parts[parts.length - 1];
  const rightKey = normalizeForCompare(right);

  if (leftKey && sourceKey && leftKey === sourceKey) {
    return rightKey === sourceKey ? "" : right;
  }

  return rightKey === sourceKey ? "" : right;
}

function formatSessionDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("es-CO", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSessionSubtitle(messages: ChatMessage[]) {
  if (messages.length === 0) return "Sin mensajes todavía";
  const last = messages[messages.length - 1];
  const compact = last.text.replace(/\s+/g, " ").trim();
  return compact.length > 44 ? `${compact.slice(0, 44)}...` : compact;
}

function parseAssistantMessage(text: string): ParsedAssistantMessage {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const result: ParsedAssistantMessage = { main: "", sentenceTranslationsEs: [] };
  const main: string[] = [];
  const inferredTranslations: string[] = [];

  const looksLikeInlineSpanishTranslation = (line: string) => {
    if (!/[()]/.test(line)) return false;
    const invertedMarks = /[¿¡]/.test(line);
    const hasAccents = /[áéíóúñÁÉÍÓÚÑ]/.test(line);
    const hasEnglishInParens = /\([^)]+[a-zA-Z][^)]+\)/.test(line);
    return hasEnglishInParens && (invertedMarks || hasAccents || line.toLowerCase().includes(" en inglés"));
  };

  const extractSpanishSide = (line: string) => line.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const isInlineCorrectionPair = (line: string) => /^".+"\s*=\s*.+$/.test(line);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("correction_es:")) {
      result.correctionEs = line.replace(/correction_es:/i, "").trim();
    } else if (lower.startsWith("correction_en:")) {
      result.correctionEn = line.replace(/correction_en:/i, "").trim();
    } else if (lower.startsWith("better_way:")) {
      result.betterWay = line.replace(/better_way:/i, "").trim();
    } else if (lower.startsWith("glossary_term:")) {
      result.glossaryTerm = line.replace(/glossary_term:/i, "").trim();
    } else if (lower.startsWith("glossary_type:")) {
      result.glossaryType = line.replace(/glossary_type:/i, "").trim();
    } else if (lower.startsWith("glossary_meaning_es:")) {
      result.glossaryMeaningEs = line.replace(/glossary_meaning_es:/i, "").trim();
    } else if (lower.startsWith("glossary_example:")) {
      result.glossaryExample = line.replace(/glossary_example:/i, "").trim();
    } else if (/^translation_es_\d+:/i.test(lower)) {
      const match = lower.match(/^translation_es_(\d+):/i);
      const value = line.replace(/^translation_es_\d+:/i, "").trim();
      if (value) {
        const idx = Math.max(0, Number(match?.[1] ?? "1") - 1);
        if (!Number.isNaN(idx)) {
          result.sentenceTranslationsEs![idx] = value;
        }
      }
    } else if (isInlineCorrectionPair(line)) {
      continue;
    } else if (looksLikeInlineSpanishTranslation(line)) {
      const inferred = extractSpanishSide(line);
      if (inferred) inferredTranslations.push(inferred);
    } else if (/^[a-z0-9_]+:/i.test(line)) {
      continue;
    } else {
      main.push(line);
    }
  }

  result.main = main.join("\n").trim();
  if (inferredTranslations.length > 0) {
    const current = result.sentenceTranslationsEs ?? [];
    if (current.length === 0) {
      result.sentenceTranslationsEs = inferredTranslations;
    } else {
      const merged = [...current];
      let inferredIndex = 0;
      for (let i = 0; i < main.length && inferredIndex < inferredTranslations.length; i += 1) {
        if (merged[i]) continue;
        merged[i] = inferredTranslations[inferredIndex] ?? "";
        inferredIndex += 1;
      }

      for (; inferredIndex < inferredTranslations.length && merged.length < main.length; inferredIndex += 1) {
        merged.push(inferredTranslations[inferredIndex] ?? "");
      }

      if (merged.length > main.length) {
        merged.length = main.length;
      }

      result.sentenceTranslationsEs = merged;
    }
  }
  return result;
}

export default function Home() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [selectedTopic, setSelectedTopic] = useState<TopicId>(() => {
    if (typeof window === "undefined") return "frontend_interview";
    const stored = window.localStorage.getItem("selectedTopic");
    return stored === "free_talk" ||
      stored === "frontend_interview" ||
      stored === "daily_english" ||
      stored === "daily_challenge_api_yesterday"
      ? stored
      : "frontend_interview";
  });
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>(() => {
    if (typeof window === "undefined") return [];

    const sessionsRaw = window.localStorage.getItem("chatSessions");
    const activeId = window.localStorage.getItem("activeChatSessionId") || "";

    if (sessionsRaw) {
      try {
        const sessions = JSON.parse(sessionsRaw) as ChatSession[];
        const active = sessions.find((session) => session.id === activeId) ?? sessions[0];
        if (active?.messages) return active.messages;
      } catch {
        // fallback below
      }
    }

    const stored = window.localStorage.getItem("chatMessages");
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored) as Array<{ role: "user" | "assistant"; text: string }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem("chatSessions");
    if (!raw) {
      return [
        {
          id: createSessionId(),
          title: "New chat",
          createdAt: new Date().toISOString(),
          messages: [],
        },
      ];
    }
    try {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (parsed.length > 0) return parsed;
      return [
        {
          id: createSessionId(),
          title: "New chat",
          createdAt: new Date().toISOString(),
          messages: [],
        },
      ];
    } catch {
      return [
        {
          id: createSessionId(),
          title: "New chat",
          createdAt: new Date().toISOString(),
          messages: [],
        },
      ];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("activeChatSessionId") || "";
  });
  const [input, setInput] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const effectiveActiveSessionId =
    chatSessions.find((session) => session.id === activeSessionId)?.id ?? chatSessions[0]?.id ?? "";
  const filteredSessions = chatSessions
    .filter((session) => {
      const q = chatSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        session.title.toLowerCase().includes(q) ||
        getSessionSubtitle(session.messages).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) {
        return a.pinned ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUsedModel, setLastUsedModel] = useState<string | null>(null);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [voiceUiState, setVoiceUiState] = useState<VoiceUiState>("idle");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("soundEnabled") !== "0";
  });
  const [timeline, setTimeline] = useState<Array<{ role: "user" | "assistant"; ms: number }>>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem("voiceTimeline");
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Array<{ role: "user" | "assistant"; ms: number }>;
    } catch {
      return [];
    }
  });
  const [isListening, setIsListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [audioProEnabled, setAudioProEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("audioProEnabled") === "1";
  });
  const [voiceRate, setVoiceRate] = useState(() => {
    if (typeof window === "undefined") return 1;
    const rawValue = window.localStorage.getItem("voiceRate");
    if (!rawValue) return 1;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(1.5, Math.max(0.7, parsed));
  });
  const [showSentenceTranslations, setShowSentenceTranslations] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("showSentenceTranslations") === "1";
  });
  const [showConversationSpanish, setShowConversationSpanish] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("showConversationSpanish") === "1";
  });
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("darkMode") === "1";
  });
  const [activeModalTab, setActiveModalTab] = useState<ModalTab>("chat");
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [coachingMode, setCoachingMode] = useState<CoachingMode>(() => {
    if (typeof window === "undefined") return "coaching";
    const stored = window.localStorage.getItem("coachingMode");
    return stored === "exam" ? "exam" : "coaching";
  });
  const [sessionScore, setSessionScore] = useState(() => {
    if (typeof window === "undefined") return { turns: 0, corrected: 0 };
    const raw = window.localStorage.getItem("sessionScore");
    if (!raw) return { turns: 0, corrected: 0 };
    try {
      return JSON.parse(raw) as { turns: number; corrected: number };
    } catch {
      return { turns: 0, corrected: 0 };
    }
  });
  const [xp, setXp] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem("xp") || "0");
  });
  const [streakDays, setStreakDays] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(window.localStorage.getItem("streakDays") || "0");
  });
  const [dailyGoalTurns, setDailyGoalTurns] = useState(() => {
    if (typeof window === "undefined") return 10;
    return Number(window.localStorage.getItem("dailyGoalTurns") || "10");
  });
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>(() => {
    if (typeof window === "undefined") return "intermediate";
    const stored = window.localStorage.getItem("learnerLevel");
    return stored === "beginner" || stored === "advanced" || stored === "intermediate"
      ? stored
      : "intermediate";
  });
  const [sessionGoal, setSessionGoal] = useState(() => {
    if (typeof window === "undefined") return "Speak confidently in interviews";
    return window.localStorage.getItem("sessionGoal") || "Speak confidently in interviews";
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === "undefined") return false;
    return !window.localStorage.getItem("onboardingDone");
  });
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => {
    if (typeof window === "undefined") return "gemini-2.5-flash";
    const stored = window.localStorage.getItem("selectedModel");
    return AVAILABLE_MODELS.some((model) => model.id === stored)
      ? (stored as ModelId)
      : "gemini-2.5-flash";
  });
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [settingsSavedFlash, setSettingsSavedFlash] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptBufferRef = useRef("");
  const latestTranscriptRef = useRef("");
  const shouldSendOnStopRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);

  const speechRecognitionSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const speechSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const lastAssistantMessage = [...messages].reverse().find((msg) => msg.role === "assistant");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("voiceRate", String(voiceRate));
  }, [voiceRate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showSentenceTranslations", showSentenceTranslations ? "1" : "0");
  }, [showSentenceTranslations]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("showConversationSpanish", showConversationSpanish ? "1" : "0");
  }, [showConversationSpanish]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("darkMode", darkMode ? "1" : "0");
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("audioProEnabled", audioProEnabled ? "1" : "0");
  }, [audioProEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("learnerLevel", learnerLevel);
  }, [learnerLevel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sessionGoal", sessionGoal);
  }, [sessionGoal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("coachingMode", coachingMode);
  }, [coachingMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sessionScore", JSON.stringify(sessionScore));
  }, [sessionScore]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("xp", String(xp));
  }, [xp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("streakDays", String(streakDays));
  }, [streakDays]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("dailyGoalTurns", String(dailyGoalTurns));
  }, [dailyGoalTurns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("soundEnabled", soundEnabled ? "1" : "0");
  }, [soundEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLoaded || !isSignedIn) return;

    const welcomeKey = "welcomeCelebrationSeen";
    if (window.localStorage.getItem(welcomeKey) === "1") return;

    window.localStorage.setItem(welcomeKey, "1");

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.linearRampToValueAtTime(780, context.currentTime + 0.2);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.03, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);

    void context.resume();

    confetti({ particleCount: 120, spread: 75, origin: { y: 0.62 } });
    window.setTimeout(() => {
      confetti({ particleCount: 90, spread: 95, origin: { y: 0.7 } });
    }, 180);
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("voiceTimeline", JSON.stringify(timeline.slice(-12)));
  }, [timeline]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("selectedTopic", selectedTopic);
  }, [selectedTopic]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("chatMessages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
  }, [chatSessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("activeChatSessionId", activeSessionId);
  }, [activeSessionId]);

  

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!isChatModalOpen) return;
    modalRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsChatModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isChatModalOpen]);

  useEffect(() => {
    if (!speechSynthesisSupported) return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [speechSynthesisSupported]);

  const speakText = async (text: string, rateOverride?: number) => {
    if (!voiceEnabled) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (audioProEnabled) {
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            lang: "en-US",
            speakingRate: rateOverride ?? voiceRate,
          }),
        });

        const raw = await response.text();
        let data: { audioContent?: string; error?: string } = {};
        try {
          data = JSON.parse(raw) as { audioContent?: string; error?: string };
        } catch {
          data = { error: "Invalid API response" };
        }
        if (response.ok && data.audioContent) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
          setIsBotSpeaking(true);
          setVoiceUiState("speaking");
          audio.onended = () => {
            setIsBotSpeaking(false);
            setVoiceUiState("idle");
          };
          audio.onerror = () => {
            setIsBotSpeaking(false);
            setVoiceUiState("idle");
          };
          await audio.play();
          return;
        }
      } catch {
        setIsBotSpeaking(false);
        setVoiceUiState("idle");
        // Fallback to browser TTS below
      }
    }

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const chunks = lines
      .map((line) => {
      const lower = line.toLowerCase();

      if (/^[a-z0-9_]+:/i.test(line)) {
        return null;
      }

      if (lower.startsWith("correction_es:")) {
        return {
          lang: "es-ES",
          value: line.replace(/correction_es:/i, "Corrección:"),
        };
      }

      if (lower.startsWith("correction_en:")) {
        return {
          lang: "en-US",
          value: line.replace(/correction_en:/i, "Correction:"),
        };
      }

      if (lower.startsWith("better_way:")) {
        return {
          lang: "en-US",
          value: line.replace(/better_way:/i, "Better way:"),
        };
      }

      return {
        lang: "en-US",
        value: line,
      };
      })
      .filter((item): item is { lang: string; value: string } => Boolean(item));

    if (chunks.length === 0) {
      setIsBotSpeaking(false);
      setVoiceUiState("idle");
      return;
    }

    window.speechSynthesis.cancel();
    setIsBotSpeaking(true);
    setVoiceUiState("speaking");

    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk.value);
      utterance.lang = chunk.lang;
      utterance.rate = rateOverride ?? voiceRate;

      const preferredVoice = voicesRef.current.find((voice) =>
        chunk.lang.startsWith("es") ? voice.lang.startsWith("es") : voice.lang.startsWith("en"),
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      if (index === chunks.length - 1) {
        utterance.onend = () => {
          setIsBotSpeaking(false);
          setVoiceUiState("idle");
        };
        utterance.onerror = () => {
          setIsBotSpeaking(false);
          setVoiceUiState("idle");
        };
      }

      window.speechSynthesis.speak(utterance);
    });
  };

  const playUiTone = (kind: "success" | "error") => {
    if (!soundEnabled || typeof window === "undefined") return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = kind === "success" ? 680 : 220;
    gain.gain.value = 0.02;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  };

  const triggerHaptic = (pattern: number | number[] = 12) => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(pattern);
  };

  const playUiClick = () => {
    if (!soundEnabled || typeof window === "undefined") return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 520;
    gain.gain.value = 0.015;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.05);
  };

  const triggerUiFeedback = () => {
    playUiClick();
    triggerHaptic(10);
  };

  const sendUserText = async (text: string) => {
    const cleanedText = text.trim();
    if (!cleanedText || isLoading) return;

    const nextMessages = [...messages, { role: "user" as const, text: cleanedText }];
    setMessages(nextMessages);
    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === effectiveActiveSessionId
          ? {
              ...session,
              title: session.title === "New chat" ? cleanedText.slice(0, 36) : session.title,
              messages: nextMessages,
            }
          : session,
      ),
    );
    setInput("");
    setError(null);
    setIsLoading(true);
    setVoiceUiState("thinking");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: selectedTopic,
          messages: nextMessages,
          model: selectedModel,
          learnerLevel,
          sessionGoal,
          coachingMode,
        }),
      });

      const raw = await response.text();
      let data: { reply?: string; error?: string; usedModel?: string } = {};
      try {
        data = JSON.parse(raw) as { reply?: string; error?: string; usedModel?: string };
      } catch {
        data = {
          error: raw.startsWith("<!DOCTYPE")
            ? "Auth/session error from server. Please refresh and sign in again."
            : "Invalid API response",
        };
      }

      if (!response.ok || !data.reply) {
        throw new Error(data.error ?? "Failed to fetch assistant reply");
      }

      const parsedReply = parseAssistantMessage(data.reply!);
      const hadCorrection = Boolean(parsedReply.correctionEs || parsedReply.correctionEn || parsedReply.betterWay);
      setSessionScore((prev) => ({ turns: prev.turns + 1, corrected: prev.corrected + (hadCorrection ? 1 : 0) }));
      setXp((prev) => prev + (hadCorrection ? 8 : 12));

      if (typeof window !== "undefined") {
        const today = new Date().toISOString().slice(0, 10);
        const lastActive = window.localStorage.getItem("lastActiveDate");
        if (lastActive !== today) {
          const todayStart = new Date(`${today}T00:00:00.000Z`);
          const yesterday = new Date(todayStart.getTime() - 86400000).toISOString().slice(0, 10);
          setStreakDays((prev) => (lastActive === yesterday ? prev + 1 : 1));
          window.localStorage.setItem("lastActiveDate", today);
        }
      }

      setMessages((prev) => {
        const updated: ChatMessage[] = [...prev, { role: "assistant", text: data.reply! }];
        setChatSessions((sessions) =>
          sessions.map((session) =>
            session.id === effectiveActiveSessionId ? { ...session, messages: updated } : session,
          ),
        );
        return updated;
      });
      setTimeline((prev) => [
        ...prev,
        { role: "user", ms: Math.max(700, Math.min(10000, cleanedText.length * 75)) },
        { role: "assistant", ms: Math.max(700, Math.min(12000, data.reply!.length * 30)) },
      ]);
      setLastUsedModel(data.usedModel ?? selectedModel);
      void speakText(data.reply);
      playUiTone("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
      setVoiceUiState("idle");
      playUiTone("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartMic = () => {
    if (!speechRecognitionSupported || isLoading) return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceUiState("listening");
    };
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceUiState("idle");
      setError("Microphone error. Please check browser permissions.");
    };
    recognition.onend = () => {
      const shouldSendNow = shouldSendOnStopRef.current;
      shouldSendOnStopRef.current = false;

      setIsListening(false);
      setMicLevel(0);
      if (!isBotSpeaking && !isLoading) {
        setVoiceUiState("idle");
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      analyserRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;

      if (shouldSendNow) {
        const textToSend = (transcriptBufferRef.current || latestTranscriptRef.current).trim();
        transcriptBufferRef.current = "";
        latestTranscriptRef.current = "";
        setInput("");
        if (textToSend) {
          void sendUserText(textToSend);
        }
      }
    };
    recognition.onresult = (event) => {
      let latestFinalChunk = "";
      let latestInterimChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const chunk = result[0]?.transcript?.trim();
        if (!chunk) continue;

        if (result.isFinal) {
          latestFinalChunk = `${latestFinalChunk} ${chunk}`.trim();
        } else {
          latestInterimChunk = `${latestInterimChunk} ${chunk}`.trim();
        }
      }

      if (latestInterimChunk) {
        latestTranscriptRef.current = `${transcriptBufferRef.current} ${latestInterimChunk}`.trim();
        setInput(latestTranscriptRef.current);
      }

      if (latestFinalChunk) {
        transcriptBufferRef.current = `${transcriptBufferRef.current} ${latestFinalChunk}`.trim();
        latestTranscriptRef.current = transcriptBufferRef.current;
        setInput(transcriptBufferRef.current);

        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }

        silenceTimeoutRef.current = setTimeout(() => {
          const textToSend = transcriptBufferRef.current.trim();
          transcriptBufferRef.current = "";
          setInput("");
          if (textToSend) {
            void sendUserText(textToSend);
          }
        }, 5000);
      }
    };

    recognition.start();

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const normalized = (data[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / data.length);
          setMicLevel(Math.min(rms * 4, 1));
          animationFrameRef.current = requestAnimationFrame(tick);
        };

        tick();
      } catch {
        setError("No pude acceder al audio del micrófono. Revisá permisos del navegador.");
      }
    })();
  };

  const handleStopMic = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
    setMicLevel(0);
  };

  const handleMicPrimaryAction = () => {
    triggerUiFeedback();
    triggerHaptic([20, 30, 20]);
    if (!isListening) {
      handleStartMic();
      return;
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Always try to send when user manually taps mic to stop.
    // Final transcript chunks can arrive right before/on end event.
    shouldSendOnStopRef.current = true;
    handleStopMic();
  };

  const handleNewChat = () => {
    const id = createSessionId();
    const newSession: ChatSession = {
      id,
      title: "New chat",
      createdAt: new Date().toISOString(),
      pinned: false,
      messages: [],
    };

    setChatSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(id);
    setMessages([]);
    setInput("");
    setError(null);
    transcriptBufferRef.current = "";
    latestTranscriptRef.current = "";
    shouldSendOnStopRef.current = false;
  };

  const handleTogglePinSession = (sessionId: string) => {
    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, pinned: !session.pinned } : session,
      ),
    );
  };

  const handleRenameSession = (sessionId: string) => {
    const current = chatSessions.find((session) => session.id === sessionId);
    const next = window.prompt("Nuevo título del chat", current?.title ?? "");
    if (!next) return;
    setChatSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, title: next.trim() || session.title } : session,
      ),
    );
  };

  const handleDeleteSession = (sessionId: string) => {
    setChatSessions((prev) => {
      const nextSessions = prev.filter((session) => session.id !== sessionId);

      if (nextSessions.length === 0) {
        const id = createSessionId();
        const newSession: ChatSession = {
          id,
          title: "New chat",
          createdAt: new Date().toISOString(),
          pinned: false,
          messages: [],
        };
        setActiveSessionId(id);
        setMessages([]);
        return [newSession];
      }

      if (effectiveActiveSessionId === sessionId) {
        setActiveSessionId(nextSessions[0].id);
        setMessages(nextSessions[0].messages);
      }

      return nextSessions;
    });
  };

  return (
    <>
      {!isSignedIn ? (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#f7f7f7] via-white to-[#eefbe0] px-4 py-10 font-sans">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#58cc02]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />

          <div className="relative w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white/95 p-7 shadow-2xl backdrop-blur">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#58cc02] text-white shadow-lg shadow-[#58cc02]/30">
              <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
              </svg>
            </div>

            <h1 className="text-center text-2xl font-extrabold text-zinc-900">Welcome to BrianEnglish1.0</h1>
            <p className="mt-2 text-center text-sm text-zinc-600">
              Sign in with Google to continue your speaking practice and keep your progress on this device.
            </p>

            <SignInButton mode="redirect" forceRedirectUrl="/" fallbackRedirectUrl="/" oauthFlow="redirect">
              <button
                type="button"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#58cc02] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#58cc02]/25 transition hover:bg-[#4fb802]"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.4 14.8 2.4 12 2.4A9.6 9.6 0 0 0 2.4 12c0 5.3 4.3 9.6 9.6 9.6 5.5 0 9.2-3.9 9.2-9.3 0-.6-.1-1.1-.2-1.6H12Z" />
                </svg>
                Continue with Google
              </button>
            </SignInButton>

            <p className="mt-4 text-center text-xs text-zinc-500">
              By continuing, you agree to use the app for personal learning purposes.
            </p>
          </div>
        </div>
      ) : null}

      {isSignedIn ? (
    <div className={`min-h-screen px-4 py-10 font-sans ${darkMode ? "theme-dark bg-[#0f1115]" : "bg-[#f7f7f7]"}`}>
      <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-[88px_1fr]">
        <aside className="relative rounded-2xl border-2 border-zinc-200 bg-white p-3 md:sticky md:top-6 md:h-[80vh]">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Open menu"
            className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-300 text-zinc-700 md:hidden"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          {isMobileMenuOpen ? (
            <div className="absolute left-3 right-3 top-14 z-20 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg md:hidden">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  aria-label="Home"
                  title="Home"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex h-11 w-full items-center justify-center rounded-xl bg-[#58cc02] text-white"
                >
                  Home
                </button>
                <button
                  type="button"
                  aria-label="Topics"
                  title="Topics"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
                >
                  Topics
                </button>
                <button
                  type="button"
                  aria-label="Chat"
                  title="Chat"
                  onClick={() => {
                    setIsChatModalOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
                >
                  Chat
                </button>
                <Link
                  href="/retos"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Retos"
                  title="Retos"
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
                >
                  Retos
                </Link>
                <Link
                  href="/pronunciation"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Pronunciation"
                  title="Pronunciation"
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
                >
                  Pronunciation
                </Link>
              </div>
            </div>
          ) : null}

          <div className="hidden flex-row items-center justify-between md:flex md:h-full md:flex-col md:justify-start md:gap-3">
            <button
              type="button"
              aria-label="Home"
              title="Home"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#58cc02] text-white"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M12 3 2 11h3v9h6v-6h2v6h6v-9h3L12 3Z" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Topics"
              title="Topics"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="Chat"
              title="Chat"
              onClick={() => setIsChatModalOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
              </svg>
            </button>

            <Link
              href="/retos"
              aria-label="Retos"
              title="Retos"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="2">
                <path d="M12 3 4 7v6c0 5 3.5 7.5 8 8 4.5-.5 8-3 8-8V7l-8-4Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </Link>

            <Link
              href="/pronunciation"
              aria-label="Pronunciation"
              title="Pronunciation"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 text-zinc-700"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="2">
                <path d="M12 3v18" />
                <path d="M8 7c0 2.5-2 2.5-2 5s2 2.5 2 5" />
                <path d="M16 7c0 2.5 2 2.5 2 5s-2 2.5-2 5" />
              </svg>
            </Link>
          </div>
        </aside>

        <section className="flex flex-col gap-4">
          <header className="space-y-2">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label="Toggle theme"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              className={`relative h-6 w-11 rounded-full border transition ${darkMode ? "border-[#58cc02] bg-[#58cc02]" : "border-zinc-300 bg-zinc-300"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${darkMode ? "left-5" : "left-0.5"}`}
              />
            </button>
            <span className="text-xs text-zinc-600">{user?.firstName ? `Hi, ${user.firstName}` : "Signed in"}</span>
            <UserButton />
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#58cc02]">
            English AI Coach
          </p>
          <h1 className="text-3xl font-extrabold text-zinc-900">
            Practice spoken English with focused topics
          </h1>
          <p className="text-zinc-600">
            Select a topic now. In the next step, we will connect this state to the chat engine and microphone.
          </p>
          </header>

          <TopicSelector
            topics={TOPICS}
            selectedTopic={selectedTopic}
            onSelect={setSelectedTopic}
          />

          <section className="rounded-2xl border-2 border-zinc-200 bg-white p-4">
            <h2 className="text-base font-bold text-zinc-900">Current topic</h2>
            <p className="mt-1 text-zinc-700">
              <span className="font-medium">{TOPICS.find((topic) => topic.id === selectedTopic)?.label ?? "Unknown topic"}</span>
            </p>
          </section>

          <section className="rounded-2xl border-2 border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">Conversation</h2>
              <p className="text-sm text-zinc-600">Open chat in a centered modal.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsChatModalOpen(true)}
              aria-label="Open chat"
              title="Open chat"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#58cc02] text-white hover:bg-[#4fb802]"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
              </svg>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-zinc-500">Status</p>
              <p className="font-semibold text-zinc-900">
                {voiceUiState === "listening" ? "Listening" : voiceUiState === "thinking" ? "Thinking" : voiceUiState === "speaking" ? "Speaking" : "Ready"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-zinc-500">Mode</p>
              <p className="font-semibold text-zinc-900">{coachingMode === "exam" ? "Exam" : "Coaching"}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-zinc-500">XP</p>
              <p className="font-semibold text-zinc-900">{xp}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <p className="text-zinc-500">Streak</p>
              <p className="font-semibold text-zinc-900">{streakDays} days</p>
            </div>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
            <motion.div
              className="h-full bg-[#58cc02]"
              animate={{
                width:
                  voiceUiState === "listening"
                    ? "35%"
                    : voiceUiState === "thinking"
                      ? "72%"
                      : voiceUiState === "speaking"
                        ? "100%"
                        : "8%",
              }}
              transition={{ duration: 0.3 }}
            />
          </div>
          </section>

          {isChatModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-2 md:p-4">
            <section ref={modalRef} tabIndex={-1} className="flex h-[100dvh] w-full max-w-5xl min-h-0 flex-col overflow-x-hidden overflow-y-hidden rounded-none border-0 bg-white p-3 shadow-xl outline-none md:h-[90vh] md:rounded-2xl md:border-2 md:border-zinc-200 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-zinc-900">BrianEnglish1.0</h2>
                <button
                  type="button"
                  onClick={() => setIsChatModalOpen(false)}
                  aria-label="Close chat"
                  title="Close chat"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="mb-3 flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="chat-scrollbar inline-flex w-full min-w-0 overflow-x-auto rounded-lg border border-zinc-300 bg-white p-1 md:w-auto md:overflow-visible">
                  <button
                    type="button"
                    onClick={() => { triggerUiFeedback(); setActiveModalTab("chat"); }}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      activeModalTab === "chat" ? "bg-[#58cc02] text-white" : "text-zinc-700"
                    }`}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => { triggerUiFeedback(); setActiveModalTab("settings"); }}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      activeModalTab === "settings" ? "bg-[#58cc02] text-white" : "text-zinc-700"
                    }`}
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => { triggerUiFeedback(); setActiveModalTab("info"); }}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      activeModalTab === "info" ? "bg-[#58cc02] text-white" : "text-zinc-700"
                    }`}
                  >
                    Info
                  </button>
                </div>

                <div className="chat-scrollbar flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:pb-0">
              <button
                type="button"
                onClick={() => { triggerUiFeedback(); setSoundEnabled((prev) => !prev); }}
                aria-label="Toggle sounds"
                title="Toggle sounds"
                className={`flex h-8 w-8 items-center justify-center rounded-lg border ${soundEnabled ? "border-[#58cc02] text-[#58cc02]" : "border-zinc-300 text-zinc-700"}`}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth="2">
                  <path d="M9 18V6l10-2v12" />
                  <circle cx="6" cy="18" r="2" />
                  <circle cx="16" cy="16" r="2" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { triggerUiFeedback(); void speakText("Hello! Let's practice English together."); }}
                disabled={!speechSynthesisSupported}
                aria-label="Test voice"
                title="Test voice"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Zm-7 8a1 1 0 0 1 2 0 5 5 0 1 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21h2a1 1 0 1 1 0 2H9a1 1 0 0 1 0-2h2v-3.08A7 7 0 0 1 5 11Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { triggerUiFeedback(); void speakText("Hello! Let's practice English together.", 0.8); }}
                disabled={!speechSynthesisSupported}
                aria-label="Repeat slowly"
                title="Repeat slowly"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth="2">
                  <path d="M4 12h10" />
                  <path d="M14 8l4 4-4 4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { triggerUiFeedback(); setVoiceEnabled((prev) => !prev); }}
                aria-label={voiceEnabled ? "Disable voice" : "Enable voice"}
                title={voiceEnabled ? "Disable voice" : "Enable voice"}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border ${voiceEnabled ? "border-[#58cc02] text-[#58cc02]" : "border-zinc-300 text-zinc-700"}`}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <path d="M14 7.8 18.2 4a1 1 0 0 1 1.8.74v14.52a1 1 0 0 1-1.8.74L14 16.2V7.8ZM3 9a1 1 0 0 1 1-1h6v8H4a1 1 0 0 1-1-1V9Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => { triggerUiFeedback(); setShowConversationSpanish((prev) => !prev); }}
                aria-label={showConversationSpanish ? "Hide Spanish conversation" : "Show Spanish conversation"}
                title={showConversationSpanish ? "Hide Spanish conversation" : "Show Spanish conversation"}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-[10px] font-bold ${showConversationSpanish ? "border-[#58cc02] text-[#58cc02]" : "border-zinc-300 text-zinc-700"}`}
              >
                ES
              </button>
              </div>
              </div>

              {activeModalTab === "settings" ? (
                <div className="chat-scrollbar mt-3 max-h-[calc(100dvh-12rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 md:max-h-[calc(90vh-10rem)]">
                  <div className="mb-3">
                    <p className="text-sm font-bold text-zinc-800">Learner level</p>
                    <select
                      value={learnerLevel}
                      onChange={(event) => setLearnerLevel(event.target.value as LearnerLevel)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm font-bold text-zinc-800">Session goal</p>
                    <input
                      value={sessionGoal}
                      onChange={(event) => setSessionGoal(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                      placeholder="e.g. Speak confidently in standups"
                    />
                  </div>

                  <div className="mb-3">
                    <p className="text-sm font-bold text-zinc-800">Daily goal (turns)</p>
                    <input
                      type="number"
                      min={3}
                      max={50}
                      value={dailyGoalTurns}
                      onChange={(event) => setDailyGoalTurns(Math.max(3, Math.min(50, Number(event.target.value) || 10)))}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                    />
                  </div>

                  <div className="mb-3">
                    <p className="text-sm font-bold text-zinc-800">Mode</p>
                    <select
                      value={coachingMode}
                      onChange={(event) => setCoachingMode(event.target.value as CoachingMode)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                    >
                      <option value="coaching">Coaching (feedback during chat)</option>
                      <option value="exam">Exam (no feedback during chat)</option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm font-bold text-zinc-800">AI model</p>
                    <select
                      value={selectedModel}
                      onChange={(event) => setSelectedModel(event.target.value as ModelId)}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                    >
                      {AVAILABLE_MODELS.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3 flex items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-zinc-800">Audio Pro</p>
                      <p className="text-xs text-zinc-600">Use Google cloud voice quality</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAudioProEnabled((prev) => !prev)}
                      aria-label="Toggle audio pro"
                      className={`relative h-6 w-11 rounded-full transition ${audioProEnabled ? "bg-[#58cc02]" : "bg-zinc-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${audioProEnabled ? "left-5" : "left-0.5"}`}
                      />
                    </button>
                  </div>

                  <div className="mb-3 flex items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-zinc-800">Dark mode</p>
                      <p className="text-xs text-zinc-600">Reduce brightness for night practice</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { triggerUiFeedback(); setDarkMode((prev) => !prev); }}
                      aria-label="Toggle dark mode"
                      className={`relative h-6 w-11 rounded-full transition ${darkMode ? "bg-[#58cc02]" : "bg-zinc-300"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${darkMode ? "left-5" : "left-0.5"}`}
                      />
                    </button>
                  </div>

                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-zinc-800">Speech speed</p>
                    <span className="text-xs text-zinc-600">{voiceRate.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={1.5}
                    step={0.1}
                    value={voiceRate}
                    onChange={(event) => setVoiceRate(Number(event.target.value))}
                    className="w-full"
                  />
                  <p className="mt-2 text-xs text-zinc-600">Lower is slower, higher is faster.</p>

                  <button
                    type="button"
                    onClick={() => {
                      setSessionScore({ turns: 0, corrected: 0 });
                      if (typeof window !== "undefined") {
                        window.localStorage.removeItem("sessionScore");
                      }
                    }}
                    className="mt-3 rounded-lg border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700"
                  >
                    Reset session score
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white p-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem("settingsLastSavedAt", new Date().toISOString());
                        }
                        setSettingsSavedFlash(true);
                        window.setTimeout(() => setSettingsSavedFlash(false), 1500);
                      }}
                      className="rounded-lg bg-[#58cc02] px-3 py-1 text-xs font-semibold text-white"
                    >
                      Save settings
                    </button>
                    <p className={`text-xs ${settingsSavedFlash ? "text-emerald-600" : "text-zinc-500"}`}>
                      {settingsSavedFlash ? "Saved ✓" : "Changes are saved automatically"}
                    </p>
                  </div>
                </div>
              ) : null}

              {activeModalTab === "chat" ? (
                <>
              <div className="mb-2 block rounded-xl border border-zinc-200 bg-zinc-50 p-2 md:hidden">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="mb-2 w-full rounded-lg bg-[#58cc02] px-2 py-2 text-xs font-semibold text-white"
                >
                  + New chat
                </button>
                <input
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.target.value)}
                  placeholder="Buscar chat..."
                  className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-800"
                />
                <div className="chat-scrollbar flex gap-2 overflow-x-auto pb-1">
                  {filteredSessions.map((session) => (
                    <button
                      key={`mobile-${session.id}`}
                      type="button"
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setMessages(session.messages);
                      }}
                      className={`shrink-0 rounded-xl border p-2 text-left text-xs ${
                        session.id === effectiveActiveSessionId
                          ? "border-[#58cc02] bg-[#f1ffe8] text-zinc-900"
                          : "border-zinc-300 bg-white text-zinc-700"
                      }`}
                    >
                      <div className="flex w-44 items-start gap-2">
                        <span className="mt-0.5 text-sm">👤</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{session.pinned ? "📌 " : ""}{session.title || "New chat"}</p>
                          <p className="truncate text-[11px] text-zinc-600">{getSessionSubtitle(session.messages)}</p>
                          <p className="mt-1 text-[10px] text-zinc-500">{formatSessionDate(session.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`mt-2 grid min-h-0 items-stretch gap-3 md:h-[calc(90vh-11.5rem)] ${
                  isHistoryCollapsed ? "md:grid-cols-[44px_1fr]" : "md:grid-cols-[220px_1fr]"
                }`}
              >
                <aside
                  className={`${isHistoryCollapsed ? "hidden md:block md:w-10" : "hidden md:flex"} h-[calc(58dvh+7rem)] min-h-0 min-w-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50 p-2 md:h-full`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    {!isHistoryCollapsed ? <p className="text-xs font-semibold text-zinc-700">Chats</p> : null}
                    <button
                      type="button"
                      onClick={() => setIsHistoryCollapsed((prev) => !prev)}
                      className="rounded border border-zinc-300 px-1 text-xs text-zinc-600"
                      title={isHistoryCollapsed ? "Expand history" : "Collapse history"}
                    >
                      {isHistoryCollapsed ? "→" : "←"}
                    </button>
                  </div>

                  {!isHistoryCollapsed ? (
                    <>
                      <button
                        type="button"
                        onClick={handleNewChat}
                        className="mb-2 w-full rounded-lg bg-[#58cc02] px-2 py-2 text-xs font-semibold text-white"
                      >
                        + New chat
                      </button>
                      <input
                        value={chatSearch}
                        onChange={(event) => setChatSearch(event.target.value)}
                        placeholder="Buscar chat..."
                        className="mb-2 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-800"
                      />
                      <div className="chat-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                        {filteredSessions.map((session) => (
                          <div
                            key={session.id}
                            className={`w-full rounded-xl border p-2 text-left text-xs ${
                              session.id === effectiveActiveSessionId
                                ? "border-[#58cc02] bg-[#f1ffe8] text-zinc-900"
                                : "border-zinc-300 bg-white text-zinc-700"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSessionId(session.id);
                                setMessages(session.messages);
                              }}
                              className="w-full text-left"
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 text-sm">👤</span>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{session.pinned ? "📌 " : ""}{session.title || "New chat"}</p>
                                  <p className="truncate text-[11px] text-zinc-600">{getSessionSubtitle(session.messages)}</p>
                                  <p className="mt-1 text-[10px] text-zinc-500">{formatSessionDate(session.createdAt)}</p>
                                </div>
                              </div>
                            </button>
                            <div className="mt-1 flex items-center gap-1">
                              <button type="button" onClick={() => handleTogglePinSession(session.id)} className="rounded border border-zinc-300 px-1 text-[10px]">📌</button>
                              <button type="button" onClick={() => handleRenameSession(session.id)} className="rounded border border-zinc-300 px-1 text-[10px]">✏️</button>
                              <button type="button" onClick={() => handleDeleteSession(session.id)} className="rounded border border-zinc-300 px-1 text-[10px]">🗑️</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </aside>

                <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col md:h-full">

          {isBotSpeaking || isListening ? (
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-1">
            <div className="grid grid-cols-2 gap-2">
              <motion.div
                animate={isBotSpeaking ? { scale: [1, 1.03, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }}
                transition={{ duration: 0.9, repeat: isBotSpeaking ? Infinity : 0 }}
                className={`rounded-xl border p-2 shadow-sm ${isBotSpeaking ? "border-fuchsia-300 bg-fuchsia-50/95" : "border-zinc-200 bg-white/95"}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white">
                    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                      <path d="M7 3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1v2a1 1 0 1 1-2 0v-2H10v2a1 1 0 1 1-2 0v-2H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H7Zm2.5 3.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 14h8a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-800">Robot Coach</p>
                    <p className="text-[11px] text-zinc-500">{isBotSpeaking ? "Talking now..." : "Waiting"}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                animate={isListening ? { scale: [1, 1.03, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }}
                transition={{ duration: 0.9, repeat: isListening ? Infinity : 0 }}
                className={`rounded-xl border p-2 shadow-sm ${isListening ? "border-emerald-300 bg-emerald-50/95" : "border-zinc-200 bg-white/95"}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#58cc02] text-white">
                    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                      <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 1 1-10 0V7a5 5 0 0 1 5-5Zm-7 9a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21h2a1 1 0 1 1 0 2H9a1 1 0 0 1 0-2h2v-3.08A7 7 0 0 1 5 11Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-800">You</p>
                    <p className="text-[11px] text-zinc-500">{isListening ? "Speaking..." : "Mic idle"}</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
          ) : null}

          <div className={`chat-scrollbar mt-3 min-h-0 w-full min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 pr-2 md:mt-4 ${isBotSpeaking || isListening ? "pt-20 md:pt-24" : "pt-3"}`}>
            {messages.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Start by writing your first message in English.
              </p>
            ) : (
              messages.map((msg, index) => {
                const parsed = msg.role === "assistant" ? parseAssistantMessage(msg.text) : null;
                const hasFeedback = Boolean(parsed?.correctionEs || parsed?.correctionEn || parsed?.betterWay);
                const hasGlossary = Boolean(parsed?.glossaryTerm || parsed?.glossaryMeaningEs || parsed?.glossaryExample);
                const previousUserText =
                  index > 0 && messages[index - 1]?.role === "user" ? messages[index - 1].text : "";

                return (
                  <motion.div
                    key={`${msg.role}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`max-w-[92%] min-w-0 rounded-xl px-3 py-2 text-sm md:max-w-[90%] ${
                      msg.role === "user"
                        ? "ml-auto bg-[#58cc02] text-white"
                        : "bg-white text-zinc-900 border border-zinc-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-full space-y-1">
                        {msg.role === "assistant" && parsed?.main ? (
                          showConversationSpanish ? (
                            <p className="whitespace-pre-wrap text-xs text-zinc-700">
                              {(() => {
                                const sentences = uniqueSentences(splitMainSentences(parsed.main));
                                const translated = sentences.map((sentence, sentenceIndex) => {
                                    const candidate = parsed.sentenceTranslationsEs?.[sentenceIndex] ?? "";
                                    if (!candidate) return `⚠️ Falta traducción: ${sentence}`;
                                    const cleaned = cleanTranslationCandidate(candidate, sentence);
                                    if (!cleaned) return `⚠️ Falta traducción: ${sentence}`;
                                    return normalizeForCompare(cleaned) === normalizeForCompare(sentence)
                                      ? `⚠️ Falta traducción: ${sentence}`
                                      : cleaned;
                                  });

                                return translated.join("\n");
                              })()}
                            </p>
                          ) : (
                          uniqueSentences(splitMainSentences(parsed.main)).map((sentence, sentenceIndex) => (
                            <div
                              key={`${sentence}-${sentenceIndex}`}
                              className={`grid gap-1 rounded-md border border-zinc-100 bg-white/60 p-1 ${showSentenceTranslations ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
                            >
                              <p className="whitespace-pre-wrap text-xs text-zinc-900">{sentence}</p>
                              {showSentenceTranslations ? (
                                <p className="whitespace-pre-wrap text-xs text-zinc-600">
                                  {(() => {
                                    const candidate = parsed.sentenceTranslationsEs?.[sentenceIndex] ?? "";
                                    if (!candidate) return "";
                                    const cleaned = cleanTranslationCandidate(candidate, sentence);
                                    if (!cleaned) return "";
                                    return normalizeForCompare(cleaned) === normalizeForCompare(sentence)
                                      ? ""
                                      : cleaned;
                                  })()}
                                </p>
                              ) : null}
                            </div>
                          ))
                          )
                        ) : (
                          <p className="whitespace-pre-wrap">{parsed?.main || msg.text}</p>
                        )}
                      </div>
                      {msg.role === "assistant" ? (
                        <button
                          type="button"
                          onClick={() => { triggerUiFeedback(); setShowSentenceTranslations((prev) => !prev); }}
                          aria-label={showSentenceTranslations ? "Hide translations" : "Show translations"}
                          title={showSentenceTranslations ? "Hide translations" : "Show translations"}
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-700"
                        >
                          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                            {showSentenceTranslations ? (
                              <path d="M2.1 11.6a1 1 0 0 1 0-.8C3.9 7 7.6 4 12 4c1.9 0 3.7.6 5.2 1.5l1.6-1.6a1 1 0 0 1 1.4 1.4l-16 16a1 1 0 0 1-1.4-1.4l3-3C4.3 15.8 3 14 2.1 12.4Zm5.1 3.9 1.6-1.6A4 4 0 0 1 12 8a4 4 0 0 1 2.8 1.1l1-1A7.5 7.5 0 0 0 12 7c-3.2 0-6 2-7.4 4.6.7 1.3 1.6 2.6 2.6 3.9Zm4.3-4.3-1.8 1.8A2 2 0 0 0 12 14a2 2 0 0 0 1.8-2.8l-2.3 2.3a1 1 0 0 1-1.4-1.4l2.3-2.3a2 2 0 0 0-.9-.2Zm6.6-3.8c1.7 1.2 3.1 2.8 3.8 4.4a1 1 0 0 1 0 .8C20.1 17 16.4 20 12 20c-1.6 0-3.1-.4-4.4-1.1l1.5-1.5c.9.4 1.9.6 2.9.6 3.2 0 6-2 7.4-4.6-.6-1.1-1.4-2.1-2.4-3.1l1.1-1.1Z" />
                            ) : (
                              <path d="M12 5c4.4 0 8.1 3 9.9 6.8a1 1 0 0 1 0 .8C20.1 16.4 16.4 19.4 12 19.4S3.9 16.4 2.1 12.6a1 1 0 0 1 0-.8C3.9 8 7.6 5 12 5Zm0 2C8.8 7 6 9 4.6 11.6 6 14.2 8.8 16.4 12 16.4s6-2.2 7.4-4.8C18 9 15.2 7 12 7Zm0 1.5a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2Zm0 2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" />
                            )}
                          </svg>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => { triggerUiFeedback(); speakText(msg.text); }}
                        aria-label="Repeat message"
                        title="Repeat message"
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                          msg.role === "user" ? "border-white/60 text-white" : "border-zinc-300 text-zinc-700"
                        }`}
                      >
                        <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                          <path d="M14 7.8 18.2 4a1 1 0 0 1 1.8.74v14.52a1 1 0 0 1-1.8.74L14 16.2V7.8ZM3 9a1 1 0 0 1 1-1h6v8H4a1 1 0 0 1-1-1V9Z" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-1 flex items-end gap-1">
                      {[1, 2, 3, 4].map((bar) => (
                        <span
                          key={bar}
                          className={`inline-block w-1 rounded ${msg.role === "user" ? "bg-white/70" : "bg-zinc-400"} ${msg.role === "assistant" && isBotSpeaking ? "animate-pulse" : ""}`}
                          style={{ height: `${4 + bar * 2}px` }}
                        />
                      ))}
                    </div>

                    {msg.role === "assistant" && (hasFeedback || hasGlossary) ? (
                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        {hasFeedback ? (
                          <div className="group relative inline-block">
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"
                              aria-label="Show correction"
                            >
                              ⚠️ Feedback
                            </button>

                            <div className="absolute left-0 top-8 z-20 hidden w-72 rounded-lg border border-amber-200 bg-white p-2 text-xs text-zinc-700 shadow-lg group-hover:block hover:block">
                              {previousUserText ? (
                                <p className="mb-1 rounded bg-zinc-50 p-1">
                                  <span className="font-semibold">How you said it:</span> {previousUserText}
                                </p>
                              ) : null}
                              {parsed?.betterWay ? (
                                <p className="mb-1 rounded bg-emerald-50 p-1">
                                  <span className="font-semibold">How it could be:</span> {parsed.betterWay}
                                </p>
                              ) : null}
                              {parsed?.correctionEn ? (
                                <p className="rounded bg-amber-50 p-1">
                                  <span className="font-semibold">Why:</span> {parsed.correctionEn}
                                </p>
                              ) : parsed?.correctionEs ? (
                                <p className="rounded bg-amber-50 p-1">
                                  <span className="font-semibold">Por qué:</span> {parsed.correctionEs}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {hasGlossary ? (
                          <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-2 text-xs text-zinc-700">
                            <p className="font-semibold text-fuchsia-700">Glossary {parsed?.glossaryType ? `(${parsed.glossaryType})` : ""}</p>
                            {parsed?.glossaryTerm ? <p><span className="font-semibold">Term:</span> {parsed.glossaryTerm}</p> : null}
                            {parsed?.glossaryMeaningEs ? <p><span className="font-semibold">Meaning (ES):</span> {parsed.glossaryMeaningEs}</p> : null}
                            {parsed?.glossaryExample ? <p><span className="font-semibold">Example:</span> {parsed.glossaryExample}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </motion.div>
                );
              })
            )}
            {isLoading ? (
              <div className="max-w-[90%] animate-pulse rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <div className="h-3 w-40 rounded bg-zinc-200" />
                <div className="mt-2 h-3 w-28 rounded bg-zinc-200" />
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>

          {lastAssistantMessage ? (
            <div className="chat-scrollbar mt-2 flex w-full min-w-0 gap-2 overflow-x-auto pb-1">
              {QUICK_REPLY_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => { triggerUiFeedback(); void sendUserText(chip); }}
                  disabled={isLoading}
                  className="max-w-[80vw] shrink-0 truncate rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 disabled:opacity-50 md:max-w-none"
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 w-full min-w-0 shrink-0 rounded-xl border border-zinc-200 bg-white/95 p-3 backdrop-blur md:mt-3 md:p-4">
            <div className="flex w-full flex-col items-center justify-center">
              <motion.button
                type="button"
                onClick={handleMicPrimaryAction}
                disabled={!speechRecognitionSupported || isLoading}
                aria-label={isListening ? "Send voice message" : "Start recording"}
                title={isListening ? "Send voice message" : "Start recording"}
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                className={`relative mx-auto flex h-20 w-20 items-center justify-center rounded-full text-white transition disabled:opacity-50 ${
                  isListening ? "bg-red-600" : "bg-[#58cc02]"
                }`}
              >
                {isListening ? (
                  <>
                    <span
                      className="absolute inset-0 rounded-full border-2 border-red-400"
                      style={{ transform: `scale(${1.1 + micLevel * 0.5})`, opacity: 0.25 + micLevel * 0.4 }}
                    />
                    <span
                      className="absolute inset-0 rounded-full border-2 border-red-300"
                      style={{ transform: `scale(${1.35 + micLevel * 0.7})`, opacity: 0.15 + micLevel * 0.35 }}
                    />
                  </>
                ) : null}
                {isLoading ? (
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg aria-hidden viewBox="0 0 24 24" className="relative h-8 w-8 fill-current">
                    <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm7-4a1 1 0 1 0-2 0 5 5 0 1 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11Z" />
                  </svg>
                )}
              </motion.button>
            </div>

            <p className="mt-3 w-full text-center text-xs text-zinc-600">
              {input ? `Transcripción: ${input}` : isListening ? "Escuchando... tocá el mic otra vez para enviar." : "Tocá el mic para empezar."}
            </p>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
                </div>
              </div>

              </>
              ) : null}

          {activeModalTab === "info" ? (
            <div className="chat-scrollbar max-h-[calc(100dvh-12rem)] space-y-2 overflow-y-auto pr-1 md:max-h-[calc(90vh-10rem)]">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-semibold text-zinc-700">Chat features (markdown)</p>
                <pre className="whitespace-pre-wrap text-xs text-zinc-700">{CHAT_FEATURES_MARKDOWN}</pre>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-zinc-200 bg-white p-2">
                  <p className="text-zinc-500">Turns</p>
                  <p className="font-bold text-zinc-900">{sessionScore.turns}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-2">
                  <p className="text-zinc-500">Corrections</p>
                  <p className="font-bold text-zinc-900">{sessionScore.corrected}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-2">
                  <p className="text-zinc-500">Accuracy</p>
                  <p className="font-bold text-zinc-900">
                    {sessionScore.turns > 0
                      ? `${Math.max(0, 100 - Math.round((sessionScore.corrected / sessionScore.turns) * 100))}%`
                      : "100%"}
                  </p>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-semibold text-zinc-700">Daily goal</p>
                  <p className="text-zinc-700">{Math.min(sessionScore.turns, dailyGoalTurns)}/{dailyGoalTurns}</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                  <div
                    className="h-full bg-[#58cc02] transition-all"
                    style={{ width: `${Math.min(100, Math.round((sessionScore.turns / Math.max(1, dailyGoalTurns)) * 100))}%` }}
                  />
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs">
                <p className="mb-2 font-semibold text-zinc-700">Voice activity timeline</p>
                <div className="space-y-1">
                  {timeline.slice(-6).map((item, idx) => (
                    <div key={`${item.role}-${idx}`} className="flex items-center gap-2">
                      <span className={`w-14 text-[11px] font-semibold ${item.role === "user" ? "text-[#58cc02]" : "text-zinc-700"}`}>{item.role}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className={`h-full ${item.role === "user" ? "bg-[#58cc02]" : "bg-zinc-500"}`}
                          style={{ width: `${Math.min(100, Math.round(item.ms / 100))}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] text-zinc-500">{Math.max(1, Math.round(item.ms / 1000))}s</span>
                    </div>
                  ))}
                </div>
              </div>

              {lastUsedModel ? (
                <p className="mt-2 text-right text-xs text-zinc-500">Model used: {lastUsedModel}</p>
              ) : null}
            </div>
          ) : null}
            </section>
          </div>
          ) : null}
        </section>

        {showOnboarding ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5">
              <h3 className="text-xl font-bold text-zinc-900">Quick setup</h3>
              <p className="mt-1 text-sm text-zinc-700">Choose your level and your speaking goal.</p>
              <select
                value={learnerLevel}
                onChange={(event) => setLearnerLevel(event.target.value as LearnerLevel)}
                className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <input
                value={sessionGoal}
                onChange={(event) => setSessionGoal(event.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
              />
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("onboardingDone", "1");
                  }
                  setShowOnboarding(false);
                }}
                className="mt-3 w-full rounded-xl bg-[#58cc02] px-4 py-2 text-sm font-bold text-white"
              >
                Start practice
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
      ) : null}
    </>
  );
}
