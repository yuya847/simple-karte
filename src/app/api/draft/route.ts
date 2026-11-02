// POST /api/draft — turn a dictated instruction into order drafts with Claude.
// Only the dictation and the (fictional) master are sent to Claude. No patient data.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiDraftResponse, DraftRequest } from "@/lib/ai-schema";
import { SYSTEM_PROMPT } from "@/lib/prompt";

export const maxDuration = 60;

const MODEL = "claude-opus-5-5";

// Best-effort limits for a public demo. Each serverless instance keeps its own counts.
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = 20;
const PER_INSTANCE = 300;
const hits = new Map<string, number[]>();
let instanceHits: number[] = [];

function limited(ip: string): boolean {
  const now = Date.now();
  instanceHits = instanceHits.filter((t) => now - t < WINDOW_MS);
  const mine = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (mine.length >= PER_IP || instanceHits.length >= PER_INSTANCE) return true;
  mine.push(now);
  instanceHits.push(now);
  hits.set(ip, mine);
  return false;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) {
    return Response.json({ error: "回数の上限に達しました。10分ほどおいてから試してください。" }, { status: 429 });
  }

  const body = DraftRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "指示は1〜800文字で入れてください。" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "サーバーに Claude の鍵が設定されていません。" }, { status: 503 });
  }

  const client = new Anthropic();
  const started = Date.now();
  // Fast mode keeps the doctor waiting less. If it is rate-limited or unavailable,
  // the same request runs at standard speed.
  const draft = (speed: "fast" | "standard") =>
    client.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: speed === "fast" ? ["server-side-fallback-2026-07-01", "fast-mode-2026-02-01"] : ["server-side-fallback-2026-07-01"],
      ...(speed === "fast" ? { speed: "fast" as const } : {}),
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(AiDraftResponse) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `<dictation>\n${body.data.text}\n</dictation>` }],
    });
  try {
    let res;
    try {
      res = await draft("fast");
    } catch (error) {
      if (!(error instanceof Anthropic.RateLimitError || error instanceof Anthropic.BadRequestError)) throw error;
      console.warn("fast mode unavailable, using standard speed:", error.status);
      res = await draft("standard");
    }

    if (res.stop_reason === "refusal") {
      return Response.json({ error: "Claude がこの指示を処理しませんでした。言い方を変えて試してください。" }, { status: 422 });
    }
    if (res.stop_reason === "max_tokens" || !res.parsed_output) {
      return Response.json({ error: "下書きを作れませんでした。指示を短く分けて試してください。" }, { status: 502 });
    }
    return Response.json({
      result: res.parsed_output,
      meta: {
        model: res.model,
        speed: res.usage.speed ?? "standard",
        ms: Date.now() - started,
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Claude が混み合っています。少しおいてから試してください。" }, { status: 429 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Claude の鍵が正しくありません。" }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error", error.status, error.message);
      return Response.json({ error: `Claude の呼び出しに失敗しました（${error.status ?? "接続"}）。` }, { status: 502 });
    }
    console.error(error);
    return Response.json({ error: "下書きを作れませんでした。" }, { status: 500 });
  }
}
