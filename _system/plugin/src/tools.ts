import { TFile } from "obsidian";
import type TableTools from "./main";
import { roll } from "./dice";
import { AssistantIndex } from "./indexer";

export interface Skill { name: string; description: string; body: string; system?: string; tools: string[]; path: string }
export interface ToolCall { name: string; args: Record<string, unknown>; id?: string }
export interface ToolResult { name: string; id?: string; result: Record<string, unknown> }

export const declarations = [
  { name: "search_vault", description: "Search notes in the active scope.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" }, kinds: { type: "ARRAY", items: { type: "STRING" } }, limit: { type: "INTEGER" } }, required: ["query"] } },
  { name: "read_note", description: "Read a note or heading in the active scope.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, heading: { type: "STRING" } }, required: ["path"] } },
  { name: "find_by_name", description: "Find an NPC, location, creature, or item by title or alias.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] } },
  { name: "list_notes", description: "List note metadata in the active scope.", parameters: { type: "OBJECT", properties: { type: { type: "STRING" }, status: { type: "STRING" }, folder: { type: "STRING" } } } },
  { name: "lookup_rule", description: "Search house rules, homebrew, and system rules.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
  { name: "get_run_state", description: "Get active run state and world day.", parameters: { type: "OBJECT", properties: {} } },
  { name: "get_combat_state", description: "Get the current combat state.", parameters: { type: "OBJECT", properties: {} } },
  { name: "roll_dice", description: "Roll a dice expression.", parameters: { type: "OBJECT", properties: { expression: { type: "STRING" } }, required: ["expression"] } },
  { name: "load_skill", description: "Load a named instruction skill.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] } },
];

const cap = (value: string): string => value.length > 8000 ? `${value.slice(0, 8000)}\n[truncated]` : value;

export class VaultTools {
  constructor(private readonly plugin: TableTools, private readonly index: AssistantIndex, private readonly skills: () => Map<string, Skill>) {}
  async run(call: ToolCall): Promise<ToolResult> {
    try { return { name: call.name, id: call.id, result: await this.execute(call.name, call.args) }; }
    catch (error) { return { name: call.name, id: call.id, result: { error: error instanceof Error ? error.message : String(error) } }; }
  }
  private async execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const scope = this.index.scope();
    if (name === "search_vault") {
      const kinds = Array.isArray(args.kinds) ? new Set(args.kinds.map(String)) : null;
      const hits = this.index.search(String(args.query ?? ""), scope, Math.min(Number(args.limit) || 8, 20)).filter(hit => !kinds || kinds.has(hit.chunk.kind));
      return { results: hits.map(hit => ({ citation: `[[${hit.chunk.path}#${hit.chunk.breadcrumb}]]`, snippet: cap(hit.chunk.text), score: hit.score })) };
    }
    if (name === "read_note") {
      const path = String(args.path ?? ""); const chunks = this.index.byPath(path, scope);
      if (!chunks.length) return { error: "The note is outside the active scope or does not exist." };
      const heading = String(args.heading ?? ""); const selected = heading ? chunks.filter(chunk => chunk.breadcrumb === heading) : chunks;
      return { path, content: cap(selected.map(chunk => `[[${chunk.path}#${chunk.breadcrumb}]]\n${chunk.text}`).join("\n\n")) };
    }
    if (name === "find_by_name") return { results: this.index.search(String(args.name ?? ""), scope, 20).map(hit => ({ citation: `[[${hit.chunk.path}#${hit.chunk.breadcrumb}]]`, title: hit.chunk.title, aliases: hit.chunk.aliases })) };
    if (name === "list_notes") {
      const files = this.plugin.app.vault.getMarkdownFiles().filter(file => this.index.byPath(file.path, scope).length > 0).filter(file => {
        const frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        return (!args.type || frontmatter.type === args.type) && (!args.status || frontmatter.status === args.status) && (!args.folder || file.path.startsWith(String(args.folder)));
      });
      return { results: files.slice(0, 100).map(file => ({ path: file.path, title: file.basename, frontmatter: this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {} })) };
    }
    if (name === "lookup_rule") {
      const priority = (kind: string): number => kind === "house-rule" ? 3 : kind === "homebrew" ? 2 : kind === "system" ? 1 : 0;
      return { results: this.index.search(String(args.query ?? ""), scope, 50).filter(hit => ["house-rule", "homebrew", "system"].includes(hit.chunk.kind)).sort((left, right) => priority(right.chunk.kind) - priority(left.chunk.kind) || right.score - left.score).slice(0, 8).map(hit => ({ citation: `[[${hit.chunk.path}#${hit.chunk.breadcrumb}]]`, text: cap(hit.chunk.text), kind: hit.chunk.kind })) };
    }
    if (name === "get_run_state") {
      const context = this.plugin.currentContext(); const read = async (file: TFile | null | undefined) => file ? await this.plugin.app.vault.cachedRead(file) : "";
      return { scope, state: await read(context?.state), worldDay: await read(context?.day) };
    }
    if (name === "get_combat_state") return { combat: this.plugin.tracker.summary() };
    if (name === "roll_dice") return roll(String(args.expression ?? "")) as unknown as Record<string, unknown>;
    if (name === "load_skill") { const skill = this.skills().get(String(args.name ?? "")); return skill ? { name: skill.name, body: cap(skill.body) } : { error: "Unknown skill." }; }
    return { error: "Unknown tool." };
  }
}

export async function loadSkills(plugin: TableTools): Promise<Map<string, Skill>> {
  const paths = ["_system/assistant/skills", "_local/assistant/skills"];
  const scope = plugin.index?.scope(); if (scope?.campaignFolder) paths.push(`${scope.campaignFolder}/Assistant/skills`);
  const result = new Map<string, Skill>();
  for (const file of plugin.app.vault.getMarkdownFiles()) {
    if (!paths.some(path => file.path.startsWith(`${path}/`))) continue;
    const raw = await plugin.app.vault.cachedRead(file); const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match) continue;
    const fields = Object.fromEntries(match[1].split("\n").map(line => line.split(/:\s*/, 2)).filter(([key, value]) => key && value));
    if (!fields.name || !fields.description) continue;
    result.set(fields.name, { name: fields.name, description: fields.description, body: match[2].trim(), system: fields.system, tools: (fields.tools ?? "").replace(/[\[\]]/g, "").split(",").map((value: string) => value.trim()).filter(Boolean), path: file.path });
  }
  return result;
}
