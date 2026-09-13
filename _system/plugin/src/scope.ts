import { TFile } from "obsidian";
import type TableTools from "./main";
import { Scope, ScopePolicy, SourceKind } from "./types";

export const assistantLayerPaths = (name: string): string[] => [`_local/assistant/${name}`, `_system/assistant/${name}`];
export const builtInExclusions = ["Archive/", ...assistantLayerPaths("scope.json").map(path => path.replace(/assistant\/.*$/, "")), ".obsidian/", ".rpgvault/"];
export const isBuiltInExcluded = (path: string): boolean => /^(?:Archive|_system|_local|\.obsidian|\.rpgvault)(?:\/|$)/.test(path);
const excluded = (path: string, prefixes: string[] = []): boolean => isBuiltInExcluded(path) || prefixes.some(prefix => path === prefix.replace(/\/$/, "") || path.startsWith(prefix));
export const defaultScopePolicy: ScopePolicy = {
  version: 1,
  exclude: [...builtInExclusions],
  gm: ["run", "state", "campaign", "party", "system", "homebrew", "house-rule", "note"],
  player: ["run", "state", "party", "note"],
};

const digest = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
};

const folderOf = (file: TFile | null | undefined): string => file?.parent?.path ?? "";

const add = (roots: { path: string; kind: SourceKind }[], enabled: SourceKind[], path: string, kind: SourceKind): void => {
  if (enabled.includes(kind) && path && !excluded(path) && !roots.some(root => root.path === path)) roots.push({ path, kind });
};

export function sourceKind(scope: Scope, path: string): SourceKind | null {
  if (excluded(path, scope.exclude) || !path.endsWith(".md")) return null;
  const root = scope.roots.filter(entry => path === entry.path || path.startsWith(`${entry.path.replace(/\.md$/, "")}/`)).sort((left, right) => right.path.length - left.path.length)[0];
  return root?.kind ?? null;
}

export function resolveScope(plugin: TableTools): Scope {
  const context = plugin.currentContext();
  const roots: { path: string; kind: SourceKind }[] = [];
  const role = String(context ? plugin.app.metadataCache.getFileCache(context.run)?.frontmatter?.role ?? "gm" : "gm").toLowerCase() === "player" ? "player" : "gm";
  const enabled = (plugin.scopePolicy ?? defaultScopePolicy)[role];
  const exclude = [...new Set((plugin.scopePolicy ?? defaultScopePolicy).exclude ?? [])];
  const campaign = context?.campaign ?? (plugin.app.vault.getAbstractFileByPath(plugin.settings.campaignPath) as TFile | null);
  const party = context?.party ?? (plugin.app.vault.getAbstractFileByPath(plugin.settings.partyPath) as TFile | null);
  const system = String(campaign ? plugin.app.metadataCache.getFileCache(campaign)?.frontmatter?.system ?? "generic" : "generic");
  const runFolder = folderOf(context?.run);
  const campaignFolder = folderOf(campaign);
  const partyFolder = folderOf(party);
  if (context) {
    add(roots, enabled, runFolder, "run");
    add(roots, enabled, partyFolder, "party");
    if (role === "gm") {
      add(roots, enabled, campaignFolder, "campaign");
      add(roots, enabled, `${campaignFolder}/Mechanics`, "homebrew");
      add(roots, enabled, `Library/Mechanics/${system}`, "system");
    }
  } else {
    add(roots, enabled, campaignFolder, "campaign");
    add(roots, enabled, partyFolder, "party");
  }
  const key = digest(JSON.stringify({ role, system, runFolder, campaignFolder, partyFolder, roots, enabled, exclude }));
  return { role, system, runFolder, campaignFolder, partyFolder, campaignPath: campaign?.path ?? "", roots, kinds: enabled, exclude, key };
}
