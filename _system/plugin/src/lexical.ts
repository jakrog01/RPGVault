import { Chunk } from "./types";

export const terms = (value: string): string[] => {
  const words = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.flatMap(word => word.length > 5 ? [word, word.slice(0, 4)] : [word]);
};

export class LexicalIndex {
  private chunks = new Map<string, Chunk>();
  private docs = new Map<string, Map<string, number>>();
  private df = new Map<string, number>();
  private length = new Map<string, number>();

  replace(chunks: Chunk[]): void { this.chunks.clear(); this.docs.clear(); this.df.clear(); this.length.clear(); for (const chunk of chunks) this.add(chunk); }
  add(chunk: Chunk): void {
    this.remove(chunk.id);
    const frequency = new Map<string, number>();
    const fields = [
      [chunk.title, 3], [chunk.aliases.join(" "), 3], [chunk.breadcrumb, 2], [chunk.text, 1],
    ] as const;
    for (const [value, boost] of fields) for (const term of terms(value)) frequency.set(term, (frequency.get(term) ?? 0) + boost);
    this.chunks.set(chunk.id, chunk); this.docs.set(chunk.id, frequency); this.length.set(chunk.id, [...frequency.values()].reduce((total, value) => total + value, 0));
    for (const term of frequency.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
  }
  remove(id: string): void { const terms = this.docs.get(id); if (terms) for (const term of terms.keys()) this.df.set(term, Math.max(0, (this.df.get(term) ?? 1) - 1)); this.chunks.delete(id); this.docs.delete(id); this.length.delete(id); }
  all(): Chunk[] { return [...this.chunks.values()]; }
  findByName(name: string, allowed: (chunk: Chunk) => boolean): Chunk[] { const needle = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); return this.all().filter(chunk => allowed(chunk) && [chunk.title, ...chunk.aliases].some(value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === needle)); }
  search(query: string, allowed: (chunk: Chunk) => boolean, limit = 50): { chunk: Chunk; score: number }[] {
    const queryTerms = [...new Set(terms(query))]; const count = this.chunks.size || 1;
    const average = [...this.length.values()].reduce((total, value) => total + value, 0) / count || 1;
    return this.all().filter(allowed).map(chunk => {
      const frequency = this.docs.get(chunk.id) ?? new Map<string, number>(); const length = this.length.get(chunk.id) ?? 0;
      const score = queryTerms.reduce((total, term) => { const tf = frequency.get(term) ?? 0; if (!tf) return total; const idf = Math.log(1 + (count - (this.df.get(term) ?? 0) + .5) / ((this.df.get(term) ?? 0) + .5)); return total + idf * (tf * 2.2) / (tf + 1.2 * (1 - .75 + .75 * length / average)); }, 0);
      return { chunk, score };
    }).filter(result => result.score > 0).sort((left, right) => right.score - left.score).slice(0, limit);
  }
}
