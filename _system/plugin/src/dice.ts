/* Dice: parsing and rolling. Accepts "2d6+3", "d20", "1d8 + 2", and "+5" (read as d20+5). */

export interface Roll { expression: string; dice: number[]; modifier: number; total: number; critical?: "success" | "failure" }

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Normalises an expression; "k" is also accepted as the die letter. */
const normalise = (expression: string): string => expression.replace(/\s+/g, "").toLowerCase().replace(/k(?=\d)/g, "d");

export function roll(expression: string): Roll {
  let normalised = normalise(expression);
  if (/^[+-]\d+$/.test(normalised)) normalised = "1d20" + normalised;
  const match = normalised.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return { expression, dice: [], modifier: 0, total: NaN };
  const count = Math.min(Number(match[1] || 1), 100), sides = Number(match[2]), modifier = Number(match[3] || 0);
  const dice: number[] = [];
  for (let index = 0; index < count; index++) dice.push(rollDie(sides));
  const result: Roll = { expression, dice, modifier, total: dice.reduce((sum, value) => sum + value, 0) + modifier };
  if (count === 1 && sides === 20) result.critical = dice[0] === 20 ? "success" : dice[0] === 1 ? "failure" : undefined;
  return result;
}

export function average(expression: string): number {
  const match = normalise(expression).match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return NaN;
  const count = Number(match[1] || 1), sides = Number(match[2]), modifier = Number(match[3] || 0);
  return Math.floor(count * (sides + 1) / 2 + modifier);
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function signed(value: number): string {
  return (value >= 0 ? "+" : "") + value;
}

/** Labels used when describing a roll. */
export interface RollLabels { critical: string; naturalOne: string }

/** Markdown description of a roll; the total is wrapped in ** for emphasis. */
export function describeRoll(result: Roll, labels: RollLabels): string {
  if (isNaN(result.total)) return `${result.expression}: ?`;
  const detail = result.dice.length > 1 || result.modifier
    ? ` [${result.dice.join("+")}${result.modifier ? signed(result.modifier) : ""}]`
    : "";
  const critical = result.critical === "success" ? ` ${labels.critical}` : result.critical === "failure" ? ` ${labels.naturalOne}` : "";
  return `${result.expression} \u2192 **${result.total}**${detail}${critical}`;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Builds the pattern for dice expressions and attack bonuses followed by one of the phrases. */
export function dicePattern(attackBonusPhrases: string): RegExp {
  const phrases = attackBonusPhrases.split(",").map(phrase => phrase.trim()).filter(Boolean).map(phrase => escapeRegExp(phrase).replace(/\s+/g, "\\s+"));
  const bonus = phrases.length ? `|([+-]\\d+)(?=\\s*(?:${phrases.join("|")}))` : "";
  return new RegExp(`(\\b\\d*[dk]\\d+(?:\\s*[+-]\\s*\\d+)?)${bonus}`, "gi");
}

/** Appends text to an element, turning dice expressions and attack bonuses into clickable rolls. */
export function highlightDice(
  element: HTMLElement,
  text: string,
  pattern: RegExp,
  title: string,
  onRoll: (expression: string, result: Roll) => void,
): void {
  const expression = new RegExp(pattern.source, pattern.flags);
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    if (match[0] === "") { expression.lastIndex++; continue; }
    if (match.index > last) element.appendText(text.slice(last, match.index));
    const value = match[0];
    const span = element.createSpan({ cls: "tt-die", text: value, attr: { title } });
    span.addEventListener("click", event => { event.stopPropagation(); onRoll(value, roll(value)); });
    last = match.index + value.length;
  }
  if (last < text.length) element.appendText(text.slice(last));
}
