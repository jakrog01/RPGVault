export interface Roll { expression: string; dice: number[]; modifier: number; total: number; critical?: "success" | "failure" }
export const rollDie = (sides: number): number => Math.floor(Math.random() * sides) + 1;
export const roll = (expression: string): Roll => {
  let normalized = expression.replace(/\s+/g, "").toLowerCase();
  if (/^[+-]\d+$/.test(normalized)) normalized = `1d20${normalized}`;
  const match = normalized.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return { expression, dice: [], modifier: 0, total: Number.NaN };
  const count = Math.min(Number(match[1] || 1), 100), sides = Number(match[2]), modifier = Number(match[3] || 0);
  const dice = Array.from({ length: count }, () => rollDie(sides));
  return { expression, dice, modifier, total: dice.reduce((sum, value) => sum + value, modifier), critical: count === 1 && sides === 20 ? dice[0] === 20 ? "success" : dice[0] === 1 ? "failure" : undefined : undefined };
};
export const average = (expression: string): number => { const match = expression.replace(/\s+/g, "").toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/); return match ? Math.floor(Number(match[1] || 1) * (Number(match[2]) + 1) / 2 + Number(match[3] || 0)) : Number.NaN; };
export const modifier = (score: number): number => Math.floor((score - 10) / 2);
export const signed = (value: number): string => `${value >= 0 ? "+" : ""}${value}`;
export const describeRoll = (result: Roll): string => Number.isNaN(result.total) ? `${result.expression}: ?` : `${result.expression} -> **${result.total}**${result.critical === "success" ? " critical success" : result.critical === "failure" ? " critical failure" : ""}`;
export const highlightDice = (element: HTMLElement, content: string, callback: (expression: string, result: Roll) => void): void => { const pattern = /\b\d*d\d+(?:\s*[+-]\s*\d+)?/gi; let offset = 0; for (const match of content.matchAll(pattern)) { const index = match.index ?? 0; element.appendText(content.slice(offset, index)); const expression = match[0]; const button = element.createSpan({ cls: "tt-die", text: expression }); button.onclick = event => { event.stopPropagation(); callback(expression, roll(expression)); }; offset = index + expression.length; } element.appendText(content.slice(offset)); };
