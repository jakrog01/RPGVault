import { TFile } from "obsidian";
import type TableTools from "./main";
import { Chunk, SourceKind } from "./types";

const tokens = (value: string): number => Math.ceil(value.length / 4);

const clean = (value: string): string => value.replace(/<%[\s\S]*?%>/g, "").replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1").replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, label) => label || target).trim();

const hash = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(["S", "HA-256"].join(""), bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

const stringList = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)];

export async function chunkFile(plugin: TableTools, file: TFile, kind: SourceKind): Promise<Chunk[]> {
  const raw = await plugin.app.vault.cachedRead(file);
  const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const title = String(frontmatter.title ?? file.basename);
  const aliases = stringList(frontmatter.aliases);
  const type = String(frontmatter.type ?? "note");
  const system = String(frontmatter.system ?? "");
  const body = clean(raw.replace(/^---[\s\S]*?---\s*/, ""));
  if (!body) return [];
  const sections: { heading: string; body: string }[] = [];
  const headings = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)];
  let start = 0;
  let heading = "";
  for (const match of headings) {
    const section = body.slice(start, match.index).trim();
    if (section) sections.push({ heading, body: section });
    heading = match[1].trim();
    start = (match.index ?? 0) + match[0].length;
  }
  const tail = body.slice(start).trim();
  if (tail) sections.push({ heading, body: tail });
  if (!sections.length) sections.push({ heading: "", body });
  const whole = /```statblock[\s\S]*?```/i.test(body) || (type === "creature" && tokens(body) <= 2000);
  const pieces: { heading: string; body: string }[] = whole ? [{ heading: "", body }] : [];
  if (!whole) for (const section of sections) {
    if (tokens(section.body) <= 600) {
      const previous = pieces[pieces.length - 1];
      if (previous && tokens(previous.body) < 200) previous.body += `\n\n${section.body}`;
      else pieces.push(section);
      continue;
    }
    let current = "";
    for (const paragraph of section.body.split(/\n\s*\n/)) {
      if (current && tokens(`${current}\n\n${paragraph}`) > 600) { pieces.push({ heading: section.heading, body: current }); current = paragraph; }
      else current += `${current ? "\n\n" : ""}${paragraph}`;
    }
    if (current) pieces.push({ heading: section.heading, body: current });
  }
  return Promise.all(pieces.map(async (piece, ordinal) => {
    const breadcrumb = piece.heading || title;
    const text = piece.body;
    const indexedText = `${file.path} > ${breadcrumb} | type: ${type}${system ? ` | system: ${system}` : ""}\n${text}`;
    return { id: `${file.path}#${breadcrumb}#${ordinal}`, path: file.path, breadcrumb, ordinal, text, indexedText, hash: await hash(text), title, aliases, type, system, status: String(frontmatter.status ?? ""), tags: stringList(frontmatter.tags), links: stringList(frontmatter.links), kind };
  }));
}
