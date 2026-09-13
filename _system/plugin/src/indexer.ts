import { TFile } from "obsidian";
import type TableTools from "./main";
import { chunkFile } from "./chunker";
import { LexicalIndex } from "./lexical";
import { isBuiltInExcluded, resolveScope, sourceKind } from "./scope";
import { Chunk, Scope } from "./types";
import { format } from "./strings";

const cachePath = ".rpgvault/cache/assistant/manifest.json";
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
    return pending ? format(this.plugin.strings.assistantIndexing, { count: pending }) : format(this.plugin.strings.assistantIndexed, { notes, chunks });
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
    this.records.set(file.path, chunks); this.indexedFiles++; if (persist) this.queuePersist(); this.changed();
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
  byPath(path: string, scope = this.scope()): Chunk[] { return (this.records.get(path) ?? []).filter(chunk => this.allowed(scope, chunk)); }

  private async restore(): Promise<void> {
    try {
      const raw = await this.plugin.app.vault.adapter.read(cachePath);
      const data = JSON.parse(raw) as { version: number; records: Chunk[]; stamps: Record<string, Stamp> };
      if (data.version !== version || !Array.isArray(data.records)) return;
      for (const chunk of data.records) { const entries = this.records.get(chunk.path) ?? []; entries.push(chunk); this.records.set(chunk.path, entries); }
      for (const [path, stamp] of Object.entries(data.stamps ?? {})) this.stamps.set(path, stamp);
      this.lexical.replace([...this.records.values()].flat());
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
      await this.plugin.app.vault.adapter.write(temporary, JSON.stringify({ version, records: [...this.records.values()].flat(), stamps: Object.fromEntries(this.stamps) }));
      if (this.plugin.app.vault.adapter.rename) await this.plugin.app.vault.adapter.rename(temporary, cachePath); else await this.plugin.app.vault.adapter.write(cachePath, JSON.stringify({ version, records: [...this.records.values()].flat() }));
    } catch {}
  }
}
