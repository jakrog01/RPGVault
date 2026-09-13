import { TFile } from "obsidian";
import type TableTools from "./main";
import { Scope, SourceKind } from "./types";

const blocked = (path: string): boolean => /^(?:Archive|_system|_local|\.obsidian|\.rpgvault)(?:\/|$)/.test(path);

const digest = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
};

const folderOf = (file: TFile | null | undefined): string => file?.parent?.path ?? "";

const add = (roots: { path: string; kind: SourceKind }[], path: string, kind: SourceKind): void => {
  if (path && !blocked(path) && !roots.some(root => root.path === path)) roots.push({ path, kind });
};

export function sourceKind(scope: Scope, path: string): SourceKind | null {
  if (blocked(path) || !path.endsWith(".md")) return null;
  const root = scope.roots.filter(entry => path === entry.path || path.startsWith(`${entry.path.replace(/\.md$/, "")}/`)).sort((left, right) => right.path.length - left.path.length)[0];
  return root?.kind ?? null;
}

export function resolveScope(plugin: TableTools): Scope {
  const context = plugin.currentContext();
  const roots: { path: string; kind: SourceKind }[] = [];
  const role = String(context ? plugin.app.metadataCache.getFileCache(context.run)?.frontmatter?.role ?? "gm" : "gm").toLowerCase() === "player" ? "player" : "gm";
  const campaign = context?.campaign ?? (plugin.app.vault.getAbstractFileByPath(plugin.settings.campaignPath) as TFile | null);
  const party = context?.party ?? (plugin.app.vault.getAbstractFileByPath(plugin.settings.partyPath) as TFile | null);
  const system = String(campaign ? plugin.app.metadataCache.getFileCache(campaign)?.frontmatter?.system ?? "generic" : "generic");
  const runFolder = folderOf(context?.run);
  const campaignFolder = folderOf(campaign);
  const partyFolder = folderOf(party);
  if (context) {
    add(roots, runFolder, "run");
    add(roots, partyFolder, "party");
    if (role === "gm") {
      add(roots, campaignFolder, "campaign");
      add(roots, `${campaignFolder}/Mechanics`, "homebrew");
      add(roots, `Library/Mechanics/${system}`, "system");
    }
  } else {
    add(roots, campaignFolder, "campaign");
    add(roots, partyFolder, "party");
  }
  const key = digest(JSON.stringify({ role, system, runFolder, campaignFolder, partyFolder, roots }));
  return { role, system, runFolder, campaignFolder, partyFolder, roots, key };
}
