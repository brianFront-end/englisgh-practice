import { NextResponse } from "next/server";
import { z } from "zod";

const ttsSchema = z.object({
  text: z.string().min(1).max(2000),
  lang: z.string().default("en-US"),
  speakingRate: z.number().min(0.25).max(2).default(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ttsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid TTS payload" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_TTS_API_KEY is missing" }, { status: 500 });
    }

    const { text, lang, speakingRate } = parsed.data;

    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: lang,
          ssmlGender: "FEMALE",
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate,
        },
      }),
    });

    const data = (await response.json()) as { audioContent?: string; error?: { message?: string } };

    if (!response.ok || !data.audioContent) {
      return NextResponse.json(
        { error: data.error?.message ?? "Google TTS failed" },
        { status: response.status || 502 },
      );
    }

    return NextResponse.json({ audioContent: data.audioContent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected TTS error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
