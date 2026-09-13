import { requestUrl } from "obsidian";
import { format, Strings } from "./strings";
import { ChatMessage } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiOptions { apiKey: string; model: string; temperature: number; system: string; retrievalInstructions?: string; tools?: unknown[] }
export interface GeminiFunctionCall { name: string; args: Record<string, unknown>; id?: string }
export interface GeminiTurn { text: string; parts: unknown[]; calls: GeminiFunctionCall[] }

export type GeminiPart = { text?: string; functionCall?: GeminiFunctionCall; functionResponse?: unknown; thoughtSignature?: string; [key: string]: unknown };

type Payload = {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string };
  message?: string;
  models?: { name?: string; supportedGenerationMethods?: string[] }[];
};

function requestBody(options: GeminiOptions, messages: ChatMessage[]) {
  return {
    system_instruction: { parts: [{ text: options.system }, ...(options.retrievalInstructions ? [{ text: options.retrievalInstructions }] : [])] },
    contents: messages.map(message => ({ role: message.role, parts: message.parts ?? [{ text: message.text }] })),
    generationConfig: { temperature: options.temperature },
    ...(options.tools?.length ? { tools: [{ functionDeclarations: options.tools }], toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
  };
}

function responseText(payload: Payload | null): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map(part => part.text ?? "").join("");
}

const appendParts = (target: GeminiPart[], incoming: GeminiPart[]): void => {
  for (const part of incoming) {
    const last = target[target.length - 1];
    if (typeof part.text === "string" && Object.keys(part).every(key => key === "text") && last && typeof last.text === "string" && Object.keys(last).every(key => key === "text")) last.text += part.text;
    else target.push({ ...part });
  }
};

const turnFromPayload = (payload: Payload): GeminiTurn => {
  const parts = payload.candidates?.[0]?.content?.parts?.map(part => ({ ...part })) ?? [];
  return { text: parts.map(part => part.text ?? "").join(""), parts, calls: parts.flatMap(part => part.functionCall ? [part.functionCall] : []) };
};

export function describeError(payload: Payload | null, status: number, strings: Strings): string {
  const message = payload?.error?.message || payload?.message || "";
  if (status === 400 && /API key/i.test(message)) return strings.errorInvalidKey;
  if (status === 403) return strings.errorForbidden;
  if (status === 404) return format(strings.errorModelMissing, { message });
  if (status === 429) return strings.errorRateLimit;
  return format(strings.errorGeneric, { status, message: message || strings.errorUnknown });
}

/** Streaming response (server-sent events). Calls onFragment for every piece of text and returns the full text. */
export async function streamResponse(
  options: GeminiOptions,
  messages: ChatMessage[],
  strings: Strings,
  onFragment: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return (await streamTurn(options, messages, strings, onFragment, signal)).text;
}

export async function streamTurn(
  options: GeminiOptions,
  messages: ChatMessage[],
  strings: Strings,
  onFragment: (text: string) => void,
  signal?: AbortSignal,
): Promise<GeminiTurn> {
  const url = `${ENDPOINT}/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options.apiKey)}`;
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody(options, messages)), signal });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    // fetch can be blocked (CORS, mobile); fall back to a non-streaming request.
    return requestTurn(options, messages, strings, onFragment);
  }
  if (!response.ok) {
    let payload: Payload | null = null;
    try { payload = await response.json() as Payload; } catch { /* no JSON body */ }
    throw new Error(describeError(payload, response.status, strings));
  }
  if (!response.body) return requestTurn(options, messages, strings, onFragment);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", output = "";
  const parts: GeminiPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let payload: Payload;
      try { payload = JSON.parse(data) as Payload; } catch { continue; }
      if (payload.error) throw new Error(describeError(payload, payload.error.code ?? 500, strings));
      const candidateParts = payload.candidates?.[0]?.content?.parts;
      if (Array.isArray(candidateParts)) appendParts(parts, candidateParts);
      const fragment = responseText(payload);
      if (fragment) { output += fragment; onFragment(fragment); }
      const blocked = payload.promptFeedback?.blockReason;
      if (blocked) { const notice = `\n\n*${format(strings.responseBlocked, { reason: blocked })}*`; output += notice; onFragment(notice); }
    }
  }
  const calls = parts.flatMap(part => part.functionCall ? [part.functionCall] : []);
  return { text: output, parts, calls };
}

export async function requestResponse(options: GeminiOptions, messages: ChatMessage[], strings: Strings, onFragment: (text: string) => void): Promise<string> {
  return (await requestTurn(options, messages, strings, onFragment)).text;
}

export async function requestTurn(options: GeminiOptions, messages: ChatMessage[], strings: Strings, onFragment: (text: string) => void): Promise<GeminiTurn> {
  const response = await requestUrl({
    url: `${ENDPOINT}/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
    method: "POST", contentType: "application/json", body: JSON.stringify(requestBody(options, messages)), throw: false,
  });
  if (response.status >= 400) throw new Error(describeError(response.json as Payload, response.status, strings));
  const turn = turnFromPayload(response.json as Payload);
  if (turn.text) onFragment(turn.text);
  return turn;
}

/** Models available to the key that support generateContent. */
export async function listModels(apiKey: string, strings: Strings): Promise<string[]> {
  const response = await requestUrl({ url: `${ENDPOINT}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`, throw: false });
  if (response.status >= 400) throw new Error(describeError(response.json as Payload, response.status, strings));
  return ((response.json as Payload)?.models ?? [])
    .filter(model => (model.supportedGenerationMethods ?? []).includes("generateContent"))
    .map(model => String(model.name).replace(/^models\//, ""))
    .filter(name => /gemini/i.test(name) && !/embedding|tts|image|audio|live|transcribe|omni|lyria|veo/i.test(name))
    .sort();
}
