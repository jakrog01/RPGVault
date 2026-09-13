import { ItemView, Modal, Notice, Setting, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type TableTools from "./main";
import { describeRoll, roll, signed } from "./dice";
import { armorClass, creatureFiles, dexterityModifier, playerFiles, readStatblock } from "./statblock";
import { Combat, EncounterSet, Participant, ParticipantKind } from "./types";

export const COMBAT_VIEW = "tt-combat";
export const newCombat = (): Combat => ({ name: "Combat", active: false, round: 0, turn: 0, participants: [], log: [] });
export const combatContext = (combat: Combat): string => `## Combat\nRound: ${combat.round}\n${combat.participants.map(participant => `${participant.name}: ${participant.hp}/${participant.hpMax}`).join("\n")}`;

export class CombatView extends ItemView {
  constructor(leaf: WorkspaceLeaf, readonly plugin: TableTools) { super(leaf); }
  getViewType(): string { return COMBAT_VIEW; }
  getDisplayText(): string { return this.plugin.strings.combat; }
  getIcon(): string { return "swords"; }
  async onOpen(): Promise<void> { this.render(); }
  render(): void {
    const root = this.contentEl; root.empty(); root.addClass("tt-combat");
    const controls = root.createDiv("tt-combat-controls");
    const button = (label: string, callback: () => void): void => { const item = controls.createEl("button", { text: label }); item.onclick = callback; };
    button(this.plugin.strings.players, () => new PlayerPicker(this.app, this).open());
    button(this.plugin.strings.enemies, () => new CreaturePicker(this.app, this).open());
    button(this.plugin.strings.rollInitiative, () => this.rollInitiative());
    button(this.plugin.combat.active ? this.plugin.strings.nextTurn : this.plugin.strings.start, () => this.plugin.combat.active ? this.advance(1) : this.start());
    button(this.plugin.strings.clearCombat, () => { this.plugin.combat = newCombat(); void this.persist(); });
    root.createEl("h3", { text: `${this.plugin.strings.round}: ${this.plugin.combat.round || "-"}` });
    if (!this.plugin.combat.participants.length) root.createEl("p", { text: this.plugin.strings.emptyCombat });
    const table = root.createEl("table", { cls: "tt-table" }); const row = table.createEl("tr"); for (const label of ["", "Initiative", "Name", "AC", "HP", ""]) row.createEl("th", { text: label });
    for (const participant of this.sorted()) { const item = table.createEl("tr", { cls: participant.hp <= 0 ? "tt-defeated" : "" }); item.createEl("td", { text: participant.initiative === null ? "-" : String(participant.initiative) }); item.createEl("td", { text: participant.name }); item.createEl("td", { text: String(participant.ac) }); item.createEl("td", { text: `${participant.hp}/${participant.hpMax}` }); const actions = item.createEl("td"); const hit = actions.createEl("button", { text: this.plugin.strings.damage }); hit.onclick = () => this.applyChange(participant, 1); const heal = actions.createEl("button", { text: this.plugin.strings.healing }); heal.onclick = () => this.applyChange(participant, -1); const remove = actions.createEl("button", { text: this.plugin.strings.remove }); remove.onclick = () => { this.plugin.combat.participants = this.plugin.combat.participants.filter(current => current.id !== participant.id); void this.persist(); }; }
  }
  sorted(): Participant[] { return [...this.plugin.combat.participants].sort((left, right) => (right.initiative ?? -Infinity) - (left.initiative ?? -Infinity)); }
  async addCreature(file: TFile, quantity = 1): Promise<void> { const statblock = await readStatblock(this.app, file); for (let index = 0; index < quantity; index += 1) this.plugin.combat.participants.push({ id: crypto.randomUUID(), name: quantity > 1 ? `${file.basename} ${index + 1}` : file.basename, kind: "enemy", initiative: null, modifier: dexterityModifier(statblock ?? undefined), ac: armorClass(statblock ?? undefined), hpMax: statblock?.hp ?? 10, hp: statblock?.hp ?? 10, temporaryHp: 0, conditions: [], note: "", hidden: false, source: file.path, statblock: statblock ?? undefined, cr: statblock?.cr === undefined ? undefined : String(statblock.cr) }); await this.persist(); }
  addPlayer(file: TFile): void { const fields = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}; this.plugin.combat.participants.push({ id: crypto.randomUUID(), name: file.basename, kind: "player", initiative: null, modifier: Number(fields.init_mod ?? 0), ac: Number(fields.ac ?? 10), hpMax: Number(fields.hp ?? 10), hp: Number(fields.hp ?? 10), temporaryHp: 0, conditions: [], note: "", hidden: false, source: file.path, level: Number(fields.level ?? 1) }); void this.persist(); }
  rollInitiative(): void { for (const participant of this.plugin.combat.participants) participant.initiative ??= roll(`1d20${signed(participant.modifier)}`).total; void this.persist(); }
  start(): void { this.rollInitiative(); this.plugin.combat.active = true; this.plugin.combat.round = 1; this.plugin.combat.turn = 0; void this.persist(); }
  advance(direction: number): void { const count = this.sorted().length; if (!count) return; this.plugin.combat.turn = (this.plugin.combat.turn + direction + count) % count; if (direction > 0 && this.plugin.combat.turn === 0) this.plugin.combat.round += 1; void this.persist(); }
  private applyChange(participant: Participant, direction: number): void { const amount = Number(prompt(this.plugin.strings.damage, "0")); if (!Number.isFinite(amount)) return; participant.hp = Math.max(0, Math.min(participant.hpMax, participant.hp - amount * direction)); this.plugin.combat.log.push(`${participant.name}: ${direction > 0 ? "damage" : "healing"} ${amount}`); void this.persist(); }
  private async persist(): Promise<void> { await this.plugin.save(); this.render(); }
}

class CreaturePicker extends Modal { constructor(app: import("obsidian").App, readonly view: CombatView) { super(app); } onOpen(): void { for (const file of creatureFiles(this.app, this.view.plugin.bestiaryPaths())) new Setting(this.contentEl).setName(file.basename).addButton(button => button.setButtonText(this.view.plugin.strings.add).onClick(() => void this.view.addCreature(file))); } }
class PlayerPicker extends Modal { constructor(app: import("obsidian").App, readonly view: CombatView) { super(app); } onOpen(): void { for (const file of playerFiles(this.app, this.view.plugin.partyPath())) new Setting(this.contentEl).setName(file.basename).addButton(button => button.setButtonText(this.view.plugin.strings.add).onClick(() => this.view.addPlayer(file))); } }
