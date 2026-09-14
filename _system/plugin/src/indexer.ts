import { Notice, TFile } from "obsidian";
import type TableTools from "./main";
import { chunkFile } from "./chunker";
import { LexicalIndex } from "./lexical";
import { isBuiltInExcluded, resolveScope, sourceKind } from "./scope";
import { Chunk, Scope } from "./types";
import { format } from "./strings";
import { cosine, EmbeddingProvider, GeminiEmbeddingProvider, NoneEmbeddingProvider, OllamaEmbeddingProvider } from "./embeddings";

const cachePath = ".rpgvault/cache/assistant/manifest.json";
const vectorsPath = ".rpgvault/cache/assistant/vectors.bin";
const version = 4;

export type ScoredChunk = { chunk: Chunk; score: number };
const rulePriority = (kind: Chunk["kind"]): number => kind === "house-rule" ? 3 : kind === "homebrew" ? 2 : kind === "system" ? 1 : 0;
export const compareRuleHits = (left: ScoredChunk, right: ScoredChunk): number => rulePriority(right.chunk.kind) - rulePriority(left.chunk.kind) || right.score - left.score;

interface Stamp { mtime: number; size: number }

export class AssistantIndex {
  readonly lexical = new LexicalIndex();
  private records = new Map<string, Chunk[]>();
  private stamps = new Map<string, Stamp>();
  private timers = new Map<string, number>();
  busy = 0;
  private indexedFiles = 0;
  private persistTimer?: number;
  private running = 0;
  private starting = false;
  private idleWaiters: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private notifyTimer?: number;
  private restored: Promise<void>;
  private provider: EmbeddingProvider = new NoneEmbeddingProvider();
  private providerKey = "none";
  private vectors = new Map<string, { hash: string; values: Float32Array }>();
  private embeddingRunning = false;
  private embeddingPaused = false;
  private embeddingWaiters: (() => void)[] = [];
  private embeddingNoticeShown = false;

  constructor(private readonly plugin: TableTools) { this.restored = this.restore(); }

  start(): void {
    let started = false;
    const launch = (): void => {
      if (started) return;
      started = true;
      this.starting = true;
      this.changed();
      void this.restored.then(() => this.rebuild()).finally(() => { this.starting = false; this.changed(); });
    };
    const resolved = this.plugin.app.metadataCache.on("resolved", launch);
    this.plugin.registerEvent(resolved);
    this.plugin.registerEvent(this.plugin.app.metadataCache.on("changed", file => this.schedule(file)));
    this.plugin.registerEvent(this.plugin.app.vault.on("delete", file => { if (file instanceof TFile) this.drop(file.path); }));
    this.plugin.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => { this.drop(oldPath); if (file instanceof TFile) this.schedule(file); }));
    const workspace = this.plugin.app.workspace as typeof this.plugin.app.workspace & { onLayoutReady?: (callback: () => void) => void };
    if (workspace.onLayoutReady) workspace.onLayoutReady(launch); else setTimeout(launch, 0);
  }

  async dispose(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.notifyTimer = undefined;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    await this.persist();
  }

  scope(): Scope { return resolveScope(this.plugin); }
  whenIdle(): Promise<void> { return this.running || this.starting || this.timers.size ? new Promise(resolve => this.idleWaiters.push(resolve)) : Promise.resolve(); }
  stats(): { notes: number; chunks: number; pending: number } {
    const scope = this.scope();
    const chunks = this.lexical.all().filter(chunk => this.allowed(scope, chunk));
    return { notes: new Set(chunks.map(chunk => chunk.path)).size, chunks: chunks.length, pending: this.running + this.timers.size + Number(this.starting) };
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private changed(): void {
    this.queueNotify();
    if (!this.running && !this.starting && !this.timers.size) for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
  private queueNotify(): void {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = undefined;
      for (const listener of this.listeners) listener();
    }, 250) as unknown as number;
  }
  status(): string {
    const { notes, chunks, pending } = this.stats();
    if (this.embeddingRunning) return format(this.plugin.strings.assistantEmbedding, { count: this.embeddingPending() });
    return pending ? format(this.plugin.strings.assistantIndexing, { count: pending }) : format(this.plugin.strings.assistantIndexed, { notes, chunks });
  }

  async applyEmbeddingSettings(): Promise<void> {
    const settings = this.plugin.settings;
    const key = settings.embeddingProvider === "ollama" ? `ollama:${settings.ollamaUrl}:${settings.ollamaModel}` : settings.embeddingProvider === "gemini" ? `gemini:${settings.geminiEmbeddingModel}:${settings.embeddingDimensions}` : "none";
    const changed = key !== this.providerKey;
    if (changed) {
      this.providerKey = key;
      this.vectors.clear();
      this.embeddingPaused = false;
      this.embeddingNoticeShown = false;
      this.queuePersist();
    }
    this.provider = settings.embeddingProvider === "ollama"
      ? new OllamaEmbeddingProvider(settings.ollamaUrl, settings.ollamaModel)
      : settings.embeddingProvider === "gemini"
        ? new GeminiEmbeddingProvider(settings.apiKey, settings.embeddingDimensions, settings.geminiEmbeddingModel)
        : new NoneEmbeddingProvider();
    void this.embedPending();
  }

  whenEmbedded(): Promise<void> {
    return this.embeddingRunning ? new Promise(resolve => this.embeddingWaiters.push(resolve)) : Promise.resolve();
  }

  async testEmbedding(): Promise<number> {
    if (this.provider.id === "none") return 0;
    return (await this.provider.embedQuery("embedding test")).length;
  }

  private embeddingPending(): number { return this.provider.id === "none" ? 0 : [...this.records.values()].flat().filter(chunk => this.vectors.get(chunk.id)?.hash !== chunk.hash).length; }

  private async embedPending(): Promise<void> {
    if (this.embeddingRunning || this.embeddingPaused || this.provider.id === "none") return;
    this.embeddingRunning = true;
    this.changed();
    try {
      await this.whenIdle();
      const pending = [...this.records.values()].flat().filter(chunk => this.vectors.get(chunk.id)?.hash !== chunk.hash);
      for (let index = 0; index < pending.length; index += 32) {
        const batch = pending.slice(index, index + 32);
        const values = await this.provider.embedDocuments(batch.map(chunk => `${chunk.title}\u0000${chunk.text}`));
        for (let item = 0; item < batch.length; item++) this.vectors.set(batch[item].id, { hash: batch[item].hash, values: values[item] });
        this.changed();
      }
      this.queuePersist();
    } catch {
      this.embeddingPaused = true;
      if (!this.embeddingNoticeShown) { this.embeddingNoticeShown = true; new Notice(this.plugin.strings.assistantEmbeddingUnavailable); }
    } finally {
      this.embeddingRunning = false;
      for (const resolve of this.embeddingWaiters.splice(0)) resolve();
      this.changed();
    }
  }

  private schedule(file: TFile): void {
    const old = this.timers.get(file.path); if (old) clearTimeout(old);
    this.timers.set(file.path, setTimeout(() => {
      this.timers.delete(file.path);
      this.running++;
      this.changed();
      void this.update(file, true, true).finally(() => {
        this.running--;
        this.changed();
      });
    }, 1500) as unknown as number);
    this.changed();
  }

  async rebuild(force = false): Promise<void> {
    this.busy++;
    this.running++;
    this.changed();
    try {
      const files = this.plugin.app.vault.getMarkdownFiles();
      const paths = new Set(files.map(file => file.path));
      this.indexedFiles = 0;
      for (let index = 0; index < files.length; index++) {
        await this.update(files[index], false, force);
        if (index % 32 === 31) await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      for (const path of [...this.records.keys()]) if (!paths.has(path)) this.drop(path, false);
      this.queuePersist();
    } finally { this.busy--; this.running--; this.changed(); }
  }

  async update(file: TFile, persist = true, force = false): Promise<void> {
    const global = this.globalKind(file);
    if (!global) { this.drop(file.path); return; }
    const stamp = { mtime: file.stat?.mtime ?? 0, size: file.stat?.size ?? 0 };
    const previousStamp = this.stamps.get(file.path);
    if (!force && previousStamp?.mtime === stamp.mtime && previousStamp.size === stamp.size && this.records.has(file.path)) return;
    const chunks = await chunkFile(this.plugin, file, global);
    const before = this.records.get(file.path) ?? [];
    this.stamps.set(file.path, stamp);
    if (before.length === chunks.length && before.every((chunk, index) => chunk.hash === chunks[index].hash)) return;
    for (const chunk of before) this.lexical.remove(chunk.id);
    for (const chunk of chunks) this.lexical.add(chunk);
    this.records.set(file.path, chunks); this.indexedFiles++; if (persist) this.queuePersist(); void this.embedPending(); this.changed();
  }

  private globalKind(file: TFile): Chunk["kind"] | null {
    if (/^(?:Archive|_system|_local|\.obsidian|\.rpgvault)(?:\/|$)/.test(file.path)) return null;
    const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    if (frontmatter.assistant === "exclude") return null;
    if (/^Runs\//.test(file.path)) return file.basename === "State" ? "state" : "run";
    if (/^Campaigns\//.test(file.path)) return file.path.includes("/Mechanics/") ? "homebrew" : "campaign";
    if (/^Parties\//.test(file.path)) return "party";
    if (/^Library\/Mechanics\//.test(file.path)) return "system";
    if (frontmatter.type === "rules" && frontmatter.subtype === "house-rule") return "house-rule";
    return "note";
  }

  private drop(path: string, persist = true): void { const chunks = this.records.get(path); if (!chunks) return; for (const chunk of chunks) this.lexical.remove(chunk.id); this.records.delete(path); this.stamps.delete(path); if (persist) this.queuePersist(); this.changed(); }
  private allowed(scope: Scope, chunk: Chunk): boolean {
    if (chunk.excluded || isBuiltInExcluded(chunk.path) || scope.exclude.some(prefix => chunk.path === prefix.replace(/\/$/, "") || chunk.path.startsWith(prefix)) || !scope.kinds.includes(chunk.kind) || (scope.role === "player" && chunk.gmOnly)) return false;
    const rooted = sourceKind(scope, chunk.path);
    if (rooted) return true;
    if (!scope.runFolder || scope.role !== "gm" || chunk.type !== "rules") return false;
    if (chunk.path.startsWith("Campaigns/")) return false;
    if (/^Library\/Mechanics\//.test(chunk.path)) return false;
    if (chunk.campaignLink) {
      const file = this.plugin.app.vault.getAbstractFileByPath(chunk.path);
      const target = file instanceof TFile
        ? this.plugin.app.metadataCache.getFirstLinkpathDest(this.linkPath(chunk.campaignLink), file.path)
        : null;
      return target?.path === scope.campaignPath;
    }
    return chunk.system === scope.system;
  }

  private linkPath(value: string): string {
    return value.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0];
  }
  search(query: string, scope = this.scope(), limit = 50): { chunk: Chunk; score: number }[] {
    const exact = this.lexical.findByName(query, chunk => this.allowed(scope, chunk));
    return exact.length ? exact.slice(0, limit).map(chunk => ({ chunk, score: Number.MAX_SAFE_INTEGER })) : this.lexical.search(query, chunk => this.allowed(scope, chunk), limit);
  }
  async hybridSearch(query: string, scope = this.scope(), limit = 50): Promise<{ chunk: Chunk; score: number }[]> {
    const lexical = this.search(query, scope, 50);
    if (this.provider.id === "none" || !this.vectors.size || this.embeddingPaused) return lexical.slice(0, limit);
    try {
      const queryVector = await this.provider.embedQuery(query);
      const semantic = this.lexical.all().filter(chunk => this.allowed(scope, chunk)).map(chunk => ({ chunk, score: cosine(queryVector, this.vectors.get(chunk.id)?.values ?? new Float32Array()) })).filter(hit => hit.score > 0).sort((left, right) => right.score - left.score).slice(0, 50);
      const ranks = new Map<string, { chunk: Chunk; score: number }>();
      for (const [rank, hit] of lexical.entries()) ranks.set(hit.chunk.id, { chunk: hit.chunk, score: 1 / (60 + rank + 1) });
      for (const [rank, hit] of semantic.entries()) { const old = ranks.get(hit.chunk.id); ranks.set(hit.chunk.id, { chunk: hit.chunk, score: (old?.score ?? 0) + 1 / (60 + rank + 1) }); }
      return [...ranks.values()].sort((left, right) => right.score - left.score).slice(0, limit);
    } catch {
      this.embeddingPaused = true;
      if (!this.embeddingNoticeShown) { this.embeddingNoticeShown = true; new Notice(this.plugin.strings.assistantEmbeddingUnavailable); }
      return lexical.slice(0, limit);
    }
  }
  byPath(path: string, scope = this.scope()): Chunk[] { return (this.records.get(path) ?? []).filter(chunk => this.allowed(scope, chunk)); }

  private async restore(): Promise<void> {
    try {
      const raw = await this.plugin.app.vault.adapter.read(cachePath);
      const data = JSON.parse(raw) as { version: number; records: Chunk[]; stamps: Record<string, Stamp>; vectors?: Record<string, { hash: string }>; providerKey?: string };
      if (data.version !== version || !Array.isArray(data.records)) return;
      for (const chunk of data.records) { const entries = this.records.get(chunk.path) ?? []; entries.push(chunk); this.records.set(chunk.path, entries); }
      for (const [path, stamp] of Object.entries(data.stamps ?? {})) this.stamps.set(path, stamp);
      this.lexical.replace([...this.records.values()].flat());
      if (data.providerKey) this.providerKey = data.providerKey;
      try {
        const binary = await this.plugin.app.vault.adapter.readBinary?.(vectorsPath);
        if (binary && data.vectors) {
          const stored = JSON.parse(new TextDecoder().decode(binary)) as Record<string, number[]>;
          for (const [id, entry] of Object.entries(data.vectors)) if (stored[id]) this.vectors.set(id, { hash: entry.hash, values: new Float32Array(stored[id]) });
        }
      } catch { this.vectors.clear(); }
    } catch { this.records.clear(); }
  }
  private queuePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => { this.persistTimer = undefined; void this.persist(); }, 5000) as unknown as number;
  }
  private async persist(): Promise<void> {
    try {
      await this.plugin.app.vault.adapter.mkdir?.(".rpgvault/cache/assistant");
      const temporary = `${cachePath}.tmp`;
      const vectorIndex = Object.fromEntries([...this.vectors].map(([id, vector]) => [id, { hash: vector.hash }]));
      await this.plugin.app.vault.adapter.write(temporary, JSON.stringify({ version, records: [...this.records.values()].flat(), stamps: Object.fromEntries(this.stamps), vectors: vectorIndex, providerKey: this.providerKey }));
      if (this.plugin.app.vault.adapter.rename) await this.plugin.app.vault.adapter.rename(temporary, cachePath); else await this.plugin.app.vault.adapter.write(cachePath, JSON.stringify({ version, records: [...this.records.values()].flat() }));
      if (this.vectors.size) await this.plugin.app.vault.adapter.writeBinary?.(vectorsPath, new TextEncoder().encode(JSON.stringify(Object.fromEntries([...this.vectors].map(([id, vector]) => [id, [...vector.values]])))).buffer);
    } catch {}
  }
}
