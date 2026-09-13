import { requestUrl } from "obsidian";

export interface EmbeddingProvider {
  id: string;
  dimensions: number;
  embedDocuments(texts: string[], signal?: AbortSignal): Promise<Float32Array[]>;
  embedQuery(text: string, signal?: AbortSignal): Promise<Float32Array>;
}

const normalise = (values: number[]): Float32Array => {
  const length = Math.sqrt(values.reduce((total, value) => total + value * value, 0)) || 1;
  return new Float32Array(values.map(value => value / length));
};

export class NoneEmbeddingProvider implements EmbeddingProvider {
  readonly id = "none";
  readonly dimensions = 0;
  async embedDocuments(texts: string[]): Promise<Float32Array[]> { return texts.map(() => new Float32Array()); }
  async embedQuery(): Promise<Float32Array> { return new Float32Array(); }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  dimensions = 0;
  constructor(private readonly baseUrl = "http://127.0.0.1:11434", private readonly model = "embeddinggemma") { this.id = `ollama:${model}`; }
  async embedDocuments(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> { return this.embed(texts.map(text => this.documentText(text)), signal); }
  async embedQuery(text: string, signal?: AbortSignal): Promise<Float32Array> { return (await this.embed([this.queryText(text)], signal))[0]; }
  private queryText(text: string): string { return this.model.startsWith("embeddinggemma") ? `task: search result | query: ${text}` : this.model.startsWith("qwen3") ? `Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: ${text}` : text; }
  private documentText(text: string): string { return this.model.startsWith("embeddinggemma") ? `title: document | text: ${text}` : text; }
  private async embed(input: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: this.model, input }), signal });
    if (!response.ok) throw new Error("Ollama embedding request failed.");
    const payload = await response.json() as { embeddings?: number[][] };
    const values = (payload.embeddings ?? []).map(normalise); this.dimensions = values[0]?.length ?? this.dimensions; return values;
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  constructor(private readonly apiKey: string, readonly dimensions = 768, private readonly model = "gemini-embedding-001") { this.id = `gemini:${model}@${dimensions}`; }
  async embedDocuments(texts: string[]): Promise<Float32Array[]> { return this.embed(texts, "RETRIEVAL_DOCUMENT"); }
  async embedQuery(text: string): Promise<Float32Array> { return (await this.embed([text], "RETRIEVAL_QUERY"))[0]; }
  private async embed(texts: string[], taskType: string): Promise<Float32Array[]> {
    const response = await requestUrl({ url: `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`, method: "POST", contentType: "application/json", body: JSON.stringify({ requests: texts.map(text => ({ model: `models/${this.model}`, content: { parts: [{ text }] }, taskType, outputDimensionality: this.dimensions })) }), throw: false });
    if (response.status >= 400) throw new Error("Gemini embedding request failed.");
    const payload = response.json as { embeddings?: { values?: number[] }[] };
    return (payload.embeddings ?? []).map(item => normalise(item.values ?? []));
  }
}

export const cosine = (left: Float32Array, right: Float32Array): number => left.length === right.length ? left.reduce((total, value, index) => total + value * right[index], 0) : 0;
