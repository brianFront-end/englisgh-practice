import { NextResponse } from "next/server";
import { z } from "zod";
import { getGoogleAiClient } from "@/lib/ai/google";
import { TOPIC_SYSTEM_PROMPTS } from "@/lib/prompts/topics";

const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
] as const;

function normalizeRequestedModel(model?: string) {
  if (!model) return undefined;

  // Legacy mapping: this model is frequently unavailable in current API versions.
  if (model === "gemini-1.5-flash") {
    return "gemini-2.0-flash";
  }

  return model;
}

const NVIDIA_MODELS = [
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "meta/llama-3.1-70b-instruct",
] as const;

let nvidiaModelsCache: { models: string[]; expiresAt: number } | null = null;

const selectableModelSchema = z.string().min(1).optional();

function splitMainSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAssistantSections(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const main: string[] = [];
  const metadataWithoutTranslations: string[] = [];
  const translations = new Map<number, string>();

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isInlineCorrectionPair = /^".+"\s*=\s*.+$/.test(line);
    if (/^translation_es_\d+:/i.test(lower)) {
      const idx = Number((lower.match(/^translation_es_(\d+):/i)?.[1] ?? "1")) - 1;
      const value = line.replace(/^translation_es_\d+:/i, "").trim();
      if (idx >= 0 && value) translations.set(idx, value);
      continue;
    }

    if (isInlineCorrectionPair) {
      metadataWithoutTranslations.push(line);
      continue;
    }

    if (
      lower.startsWith("correction_es:") ||
      lower.startsWith("better_way:") ||
      lower.startsWith("glossary_term:") ||
      lower.startsWith("glossary_type:") ||
      lower.startsWith("glossary_meaning_es:") ||
      lower.startsWith("glossary_example:")
    ) {
      metadataWithoutTranslations.push(line);
      continue;
    }

    if (/^[a-z0-9_]+:/i.test(line)) {
      metadataWithoutTranslations.push(line);
      continue;
    }

    main.push(line);
  }

  return {
    mainText: main.join("\n").trim(),
    metadataWithoutTranslations,
    translations,
  };
}

async function generateWithModelName(
  modelName: string,
  prompt: string,
  ai: ReturnType<typeof getGoogleAiClient>,
) {
  const shouldUseNvidia =
    NVIDIA_MODELS.includes(modelName as (typeof NVIDIA_MODELS)[number]) ||
    isNvidiaFamilyModel(modelName);

  if (shouldUseNvidia) {
    return generateWithNvidia(modelName, prompt);
  }

  if (isGroqFamilyModel(modelName)) {
    return generateWithGroq(modelName, prompt);
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
  });

  return response.text?.trim();
}

async function ensureCompleteTranslations(
  outputText: string,
  modelName: string,
  ai: ReturnType<typeof getGoogleAiClient>,
) {
  const parsed = parseAssistantSections(outputText);
  const mainSentences = splitMainSentences(parsed.mainText);

  if (mainSentences.length === 0) return outputText;

  const complete = mainSentences.every((_, idx) => {
    const value = parsed.translations.get(idx);
    return Boolean(value && value.trim());
  });

  if (!complete) {
    const numbered = mainSentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const translationPrompt = `Translate each English sentence to natural Spanish.\nReturn ONLY this strict format, one per line:\nT1: ...\nT2: ...\n...\n\nSentences:\n${numbered}`;

    try {
      const translatedRaw = (await generateWithModelName(modelName, translationPrompt, ai)) ?? "";
      const lines = translatedRaw.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^t(\d+):\s*(.+)$/i);
        if (!match) continue;
        const idx = Number(match[1]) - 1;
        const value = (match[2] ?? "").trim();
        if (idx >= 0 && idx < mainSentences.length && value) {
          parsed.translations.set(idx, value);
        }
      }
    } catch {
      // Keep original output if translation repair fails.
    }
  }

  const translationLines = mainSentences.map((sentence, idx) => {
    const value = parsed.translations.get(idx)?.trim();
    return `TRANSLATION_ES_${idx + 1}: ${value || sentence}`;
  });

  const blocks = [parsed.mainText, ...parsed.metadataWithoutTranslations, ...translationLines].filter(Boolean);
  return blocks.join("\n");
}

async function generateWithNvidia(model: string, prompt: string) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is missing");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 500,
    }),
  });
  clearTimeout(timeoutId);

  const rawBody = await response.text();
  let data: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } = {};

  try {
    data = JSON.parse(rawBody) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
  } catch {
    if (!response.ok) {
      throw new Error(`NVIDIA API error (${response.status}): ${rawBody.slice(0, 180)}`);
    }
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error("NVIDIA authentication failed (401). Check NVIDIA_API_KEY.");
    if (response.status === 429) throw new Error("NVIDIA rate limit reached (429). Try another model.");
    if (response.status === 404) throw new Error(`NVIDIA model not found (404): ${model}`);
    throw new Error(data.error?.message ?? `NVIDIA API error (${response.status})`);
  }

  return data.choices?.[0]?.message?.content?.trim();
}

async function listNvidiaModels() {
  const now = Date.now();
  if (nvidiaModelsCache && now < nvidiaModelsCache.expiresAt) {
    return nvidiaModelsCache.models;
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));

    nvidiaModelsCache = {
      models,
      expiresAt: now + 5 * 60 * 1000,
    };

    return models;
  } catch {
    return [];
  }
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("quota") ||
    message.includes("rate limit")
  );
}

function isModelUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("404") ||
    message.includes("not_found") ||
    message.includes("model is not found") ||
    message.includes("is not found for api version") ||
    message.includes("not supported for generatecontent")
  );
}

function isNvidiaFamilyModel(modelName: string) {
  return (
    modelName.startsWith("nvidia/") ||
    modelName.startsWith("meta/") ||
    modelName.startsWith("mistralai/") ||
    modelName.startsWith("qwen/") ||
    modelName.startsWith("microsoft/") ||
    modelName.startsWith("google/")
  );
}

function isGroqFamilyModel(modelName: string) {
  return modelName.startsWith("groq/");
}

async function generateWithGroq(model: string, prompt: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const rawModel = model.replace(/^groq\//, "");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: rawModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 500,
    }),
  });

  clearTimeout(timeoutId);

  const rawBody = await response.text();
  let data: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } = {};

  try {
    data = JSON.parse(rawBody) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
  } catch {
    if (!response.ok) {
      throw new Error(`Groq API error (${response.status}): ${rawBody.slice(0, 180)}`);
    }
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error("Groq authentication failed (401). Check GROQ_API_KEY.");
    if (response.status === 429) throw new Error("Groq rate limit reached (429). Try another model.");
    if (response.status === 404) throw new Error(`Groq model not found (404): ${rawModel}`);
    throw new Error(data.error?.message ?? `Groq API error (${response.status})`);
  }

  return data.choices?.[0]?.message?.content?.trim();
}

const chatRequestSchema = z.object({
  topic: z.enum([
    "frontend_interview",
    "free_talk",
    "daily_english",
    "daily_challenge_api_yesterday",
  ]),
  model: selectableModelSchema,
  learnerLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  sessionGoal: z.string().min(1).max(120).optional(),
  coachingMode: z.enum(["coaching", "exam"]).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { topic, messages, model, learnerLevel, sessionGoal, coachingMode } = parsed.data;
    const normalizedModel = normalizeRequestedModel(model);
    const ai = getGoogleAiClient();

    const transcript = messages
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`)
      .join("\n");

    const feedbackPolicy =
      coachingMode === "exam"
        ? "- Exam mode is active: DO NOT include correction blocks during the conversation. Keep natural conversation only."
        : "- Give corrections ONLY when there is a real grammar/structure/meaning issue.\n- Ignore minor punctuation/transcription noise from speech-to-text.\n- When correction is needed, use exactly:\nCORRECTION_ES: ...\nBETTER_WAY: ...\n- Do not include CORRECTION_EN.\n- When user sentence is already natural, do NOT output correction blocks.";

    const coachingContext = `\n\nCoaching context:\n- Learner level: ${learnerLevel ?? "intermediate"}\n- Session goal: ${sessionGoal ?? "General speaking practice"}\n- Mode: ${coachingMode ?? "coaching"}\n\nFeedback policy:\n${feedbackPolicy}`;

    const prompt = `${TOPIC_SYSTEM_PROMPTS[topic]}${coachingContext}\n\nConversation so far:\n${transcript}\n\nNow respond to the user message.`;

    let outputText: string | undefined;
    let lastError: unknown;

    const chain = normalizedModel
      ? isNvidiaFamilyModel(normalizedModel) || isGroqFamilyModel(normalizedModel)
        ? [normalizedModel]
        : [normalizedModel, ...MODEL_FALLBACK_CHAIN.filter((item) => item !== normalizedModel)]
      : MODEL_FALLBACK_CHAIN;

    let usedModel: string | undefined;

    if (normalizedModel && isNvidiaFamilyModel(normalizedModel)) {
      const availableNvidiaModels = await listNvidiaModels();
      if (availableNvidiaModels.length > 0 && !availableNvidiaModels.includes(normalizedModel)) {
        chain.splice(0, chain.length, availableNvidiaModels[0]);
      }
    }

    for (const modelName of chain) {
      try {
        outputText = await generateWithModelName(modelName, prompt, ai);

        if (outputText) {
          usedModel = modelName;
          break;
        }
      } catch (error) {
        lastError = error;
        if (!isQuotaOrRateLimitError(error) && !isModelUnavailableError(error)) {
          throw error;
        }
      }
    }

    if (!outputText && lastError) {
      throw lastError;
    }

    if (!outputText) {
      return NextResponse.json(
        { error: "Model returned an empty response" },
        { status: 502 },
      );
    }

    const finalizedReply = await ensureCompleteTranslations(outputText, usedModel ?? chain[0], ai);

    return NextResponse.json({ reply: finalizedReply, usedModel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
