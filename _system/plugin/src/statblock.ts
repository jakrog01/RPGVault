import { App, TFile, parseYaml } from "obsidian";
import { EXPERIENCE_BY_CHALLENGE, Statblock } from "./types";

export const readStatblock = async (app: App, file: TFile): Promise<Statblock | null> => {
  const content = await app.vault.cachedRead(file);
  const match = content.match(/```statblock\s*\n([\s\S]*?)```/);
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  let statblock: Statblock | null = null;
  if (match) { try { statblock = parseYaml(match[1]) as Statblock; } catch { return null; } }
  if (!statblock && frontmatter.monster) statblock = frontmatter.monster as Statblock;
  if (!statblock) return null;
  statblock.name ||= file.basename;
  if (statblock.cr === undefined && frontmatter.cr !== undefined) statblock.cr = String(frontmatter.cr);
  return statblock;
};
export const experienceForChallenge = (challenge: string | number | undefined): number => challenge === undefined ? 0 : EXPERIENCE_BY_CHALLENGE[String(challenge).trim()] ?? 0;
export const armorClass = (statblock?: Statblock): number => Number.parseInt(String(statblock?.ac ?? 10), 10) || 10;
export const dexterityModifier = (statblock?: Statblock): number => typeof statblock?.stats?.[1] === "number" ? Math.floor((statblock.stats[1] - 10) / 2) : 0;
export const creatureFiles = (app: App, folders: string[]): TFile[] => app.vault.getMarkdownFiles().filter(file => app.metadataCache.getFileCache(file)?.frontmatter?.type === "creature" || folders.some(folder => file.path.startsWith(`${folder}/`))).sort((left, right) => left.basename.localeCompare(right.basename));
export const playerFiles = (app: App, folder: string): TFile[] => app.vault.getMarkdownFiles().filter(file => { const fields = app.metadataCache.getFileCache(file)?.frontmatter; return (fields?.type === "npc" && fields?.subtype === "pc") || Boolean(folder && file.path.startsWith(`${folder}/`) && !file.path.endsWith(`/${folder.split("/").pop()}.md`)); }).sort((left, right) => left.basename.localeCompare(right.basename));
export const savesText = (value: Statblock["saves"]): string => !value ? "" : (Array.isArray(value) ? value : [value]).flatMap(item => Object.entries(item).map(([key, number]) => `${key} ${number >= 0 ? "+" : ""}${number}`)).join(", ");
