import { requestUrl } from "obsidian";
import { ChatMessage } from "./types";

const endpoint = "https://generativelanguage.googleapis.com/v1beta";
export interface GeminiOptions { apiKey: string; model: string; temperature: number; system: string }
const requestBody = (options: GeminiOptions, messages: ChatMessage[]) => ({ system_instruction: { parts: [{ text: options.system }] }, contents: messages.map(message => ({ role: message.role, parts: [{ text: message.text }] })), generationConfig: { temperature: options.temperature } });
const responseText = (payload: unknown): string => Array.isArray((payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts) ? (payload as { candidates: Array<{ content: { parts: Array<{ text?: string }> } }> }).candidates[0].content.parts.map(part => part.text ?? "").join("") : "";
export const streamResponse = async (options: GeminiOptions, messages: ChatMessage[], onFragment: (text: string) => void, signal?: AbortSignal): Promise<string> => {
  const url = `${endpoint}/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options.apiKey)}`;
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody(options, messages)), signal }); } catch { return requestResponse(options, messages, onFragment); }
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  if (!response.body) return requestResponse(options, messages, onFragment);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", output = "";
  for (;;) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? ""; for (const line of lines) { if (!line.trim().startsWith("data:")) continue; const payload = line.trim().slice(5).trim(); if (!payload || payload === "[DONE]") continue; const fragment = responseText(JSON.parse(payload)); output += fragment; onFragment(fragment); } }
  return output;
};
export const requestResponse = async (options: GeminiOptions, messages: ChatMessage[], onFragment: (text: string) => void): Promise<string> => { const response = await requestUrl({ url: `${endpoint}/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`, method: "POST", contentType: "application/json", body: JSON.stringify(requestBody(options, messages)), throw: false }); if (response.status >= 400) throw new Error(`Gemini request failed (${response.status})`); const output = responseText(response.json); onFragment(output); return output; };
export const listModels = async (apiKey: string): Promise<string[]> => { const response = await requestUrl({ url: `${endpoint}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`, throw: false }); if (response.status >= 400) throw new Error(`Gemini request failed (${response.status})`); return ((response.json?.models ?? []) as Array<{ name?: string; supportedGenerationMethods?: string[] }>).filter(model => model.supportedGenerationMethods?.includes("generateContent")).map(model => String(model.name).replace(/^models\//, "")).filter(model => /gemini/i.test(model) && !/embedding|tts|image|audio|live|transcribe|omni|lyria|veo/i.test(model)).sort(); };
