import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

export function getGoogleAiClient() {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is missing");
  }

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}
