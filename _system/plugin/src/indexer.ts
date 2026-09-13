import { TFile } from "obsidian";
import type TableTools from "./main";
import { chunkFile } from "./chunker";
import { LexicalIndex } from "./lexical";
import { inScope, resolveScope } from "./scope";
import { Chunk, Scope } from "./types";

const cachePath = ".rpgvault/cache/assistant/manifest.json";
const version = 1;

export class AssistantIndex {
  readonly lexical = new LexicalIndex();
  private records = new Map<string, Chunk[]>();
  private timers = new Map<string, number>();
  busy = 0;

  constructor(private readonly plugin: TableTools) {}

  async start(): Promise<void> {
    this.plugin.registerEvent(this.plugin.app.metadataCache.on("resolved", () => void this.rebuild()));
    this.plugin.registerEvent(this.plugin.app.metadataCache.on("changed", file => this.schedule(file)));
    this.plugin.registerEvent(this.plugin.app.vault.on("delete", file => { if (file instanceof TFile) this.drop(file.path); }));
    this.plugin.registerEvent(this.plugin.app.vault.on("rename", (file, oldPath) => { this.drop(oldPath); if (file instanceof TFile) this.schedule(file); }));
    await this.restore();
    await this.rebuild();
  }

  dispose(): void { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); }

  scope(): Scope { return resolveScope(this.plugin); }
  status(): string { const scope = this.scope(); const chunks = this.search("", scope, 100000).length; return this.busy ? `indexing ${this.busy}...` : `${chunks} notes indexed`; }

  private schedule(file: TFile): void {
    const old = this.timers.get(file.path); if (old) clearTimeout(old);
    this.timers.set(file.path, setTimeout(() => { this.timers.delete(file.path); void this.update(file); }, 1500) as unknown as number);
  }

  async rebuild(): Promise<void> {
    this.busy++;
    try {
      const files = this.plugin.app.vault.getMarkdownFiles();
      for (const file of files) { await this.update(file, false); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
      this.reindex(); await this.persist();
    } finally { this.busy--; }
  }

  async update(file: TFile, persist = true): Promise<void> {
    const global = this.globalKind(file);
    if (!global) { this.drop(file.path); return; }
    const chunks = await chunkFile(this.plugin, file, global);
    const before = this.records.get(file.path) ?? [];
    if (before.length === chunks.length && before.every((chunk, index) => chunk.hash === chunks[index].hash)) return;
    this.records.set(file.path, chunks); this.reindex(); if (persist) await this.persist();
  }

  private globalKind(file: TFile): Chunk["kind"] | null {
    if (/^(?:Archive|_system|_local|\.obsidian|\.rpgvault)(?:\/|$)/.test(file.path)) return null;
    const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    if (frontmatter.assistant === "exclude") return null;
    if (/^Runs\//.test(file.path)) return file.basename === "State" ? "state" : "run";
    if (/^Campaigns\//.test(file.path)) return file.path.includes("/Mechanics/") ? "homebrew" : "campaign";
    if (/^Parties\//.test(file.path)) return "party";
    if (/^Library\/Mechanics\//.test(file.path)) return "system";
    return "note";
  }

  private drop(path: string): void { if (this.records.delete(path)) { this.reindex(); void this.persist(); } }
  private reindex(): void { this.lexical.replace([...this.records.values()].flat()); }
  private allowed(scope: Scope, chunk: Chunk): boolean {
    const file = this.plugin.app.vault.getAbstractFileByPath(chunk.path);
    return file instanceof TFile && inScope(this.plugin, scope, file) !== null;
  }
  search(query: string, scope = this.scope(), limit = 50): { chunk: Chunk; score: number }[] {
    const exact = this.lexical.findByName(query, chunk => this.allowed(scope, chunk));
    return exact.length ? exact.slice(0, limit).map(chunk => ({ chunk, score: Number.MAX_SAFE_INTEGER })) : this.lexical.search(query, chunk => this.allowed(scope, chunk), limit);
  }
  byPath(path: string, scope = this.scope()): Chunk[] { return (this.records.get(path) ?? []).filter(chunk => this.allowed(scope, chunk)); }

  private async restore(): Promise<void> {
    try {
      const raw = await this.plugin.app.vault.adapter.read(cachePath);
      const data = JSON.parse(raw) as { version: number; records: Chunk[] };
      if (data.version !== version || !Array.isArray(data.records)) return;
      for (const chunk of data.records) (this.records.get(chunk.path) ?? this.records.set(chunk.path, []).get(chunk.path) as Chunk[]).push(chunk);
      this.reindex();
    } catch { this.records.clear(); }
  }
  private async persist(): Promise<void> {
    try {
      await this.plugin.app.vault.adapter.mkdir?.(".rpgvault/cache/assistant");
      await this.plugin.app.vault.adapter.write(cachePath, JSON.stringify({ version, records: [...this.records.values()].flat() }));
    } catch {}
  }
}
