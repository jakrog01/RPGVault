import { App, FuzzySuggestModal, ItemView, MarkdownView, Modal, Notice, Setting, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type TableTools from "./main";
import { abilityModifier, describeRoll, dicePattern, highlightDice, roll, Roll, signed } from "./dice";
import { CONDITIONS, DifficultyLevel, encounterMultiplier, THRESHOLDS } from "./rules";
import { armorClass, creatureFiles, dexterityModifier, experienceForChallenge, playerFiles, readStatblock, savesText } from "./statblock";
import { conditionDescription, conditionLabel, format, Strings } from "./strings";
import { Combat, EncounterMember, EncounterSet, Participant, ParticipantKind, Trait } from "./types";

export const COMBAT_VIEW = "tt-combat";

const DYING = "dying";
const LOG_LIMIT = 200;

const uid = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function newCombat(name = "Encounter"): Combat {
  return { name, active: false, round: 0, turn: 0, participants: [], log: [] };
}

export function sortedParticipants(combat: Combat): Participant[] {
  return [...combat.participants].sort((left, right) => {
    const leftInitiative = left.initiative ?? -999, rightInitiative = right.initiative ?? -999;
    if (rightInitiative !== leftInitiative) return rightInitiative - leftInitiative;
    if (left.kind !== right.kind) return left.kind === "player" ? -1 : 1;
    return right.modifier - left.modifier;
  });
}

export interface Difficulty { xp: number; adjustedXp: number; level: DifficultyLevel; thresholds: number[]; players: number }

export interface PlayerInput { name: string; ac: number; hp: number; modifier: number; level: number; source?: string }

/** Combat rules and state changes, independent of any open view. */
export class CombatTracker {
  constructor(private readonly plugin: TableTools) {}

  get combat(): Combat { return this.plugin.combat; }
  private get strings(): Strings { return this.plugin.strings; }

  private changed(): void {
    void this.plugin.save();
    this.plugin.refreshViews();
  }

  log(entry: string): void {
    this.combat.log.push(entry);
    if (this.combat.log.length > LOG_LIMIT) this.combat.log.shift();
  }

  async addCreature(file: TFile, quantity: number, shareInitiative: boolean): Promise<void> {
    const statblock = await readStatblock(this.plugin.app, file, path => new Notice(format(this.strings.invalidStatblock, { path })));
    const fields = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const baseName = statblock?.name ?? file.basename;
    const existing = this.combat.participants.filter(participant => participant.group === baseName || participant.name === baseName).length;
    const modifier = dexterityModifier(statblock ?? undefined);
    const groupInitiative = shareInitiative && this.plugin.settings.groupInitiative ? roll(signed(modifier)).total : null;
    for (let index = 0; index < quantity; index++) {
      const hpMax = statblock?.hit_dice && !this.plugin.settings.useAverageHitPoints
        ? (roll(statblock.hit_dice).total || statblock.hp || 10)
        : (statblock?.hp ?? 10);
      const cr = statblock?.cr != null ? String(statblock.cr) : fields.cr != null ? String(fields.cr) : undefined;
      this.combat.participants.push({
        id: uid(),
        name: quantity > 1 || existing > 0 ? `${baseName} ${existing + index + 1}` : baseName,
        kind: "enemy",
        initiative: groupInitiative ?? (this.combat.active ? roll(signed(modifier)).total : null),
        modifier,
        ac: armorClass(statblock ?? undefined),
        hpMax, hp: hpMax, temporaryHp: 0, conditions: [], note: "", hidden: false,
        group: quantity > 1 ? baseName : undefined,
        source: file.path,
        statblock: statblock ?? undefined,
        cr,
        xp: experienceForChallenge(cr),
      });
    }
    this.log(format(this.strings.logAdded, { name: baseName, quantity }));
    this.changed();
  }

  addPlayer(input: PlayerInput): boolean {
    if (this.combat.participants.some(participant => participant.name === input.name && participant.kind === "player")) {
      new Notice(format(this.strings.playerAlreadyInCombat, { name: input.name }));
      return false;
    }
    this.combat.participants.push({
      id: uid(), name: input.name, kind: "player", initiative: null, modifier: input.modifier, ac: input.ac,
      hpMax: input.hp, hp: input.hp, temporaryHp: 0, conditions: [], note: "", hidden: false, source: input.source, level: input.level,
    });
    this.changed();
    return true;
  }

  rollInitiative(onlyMissing = false): void {
    const groups = new Map<string, number>();
    for (const participant of this.combat.participants) {
      if (onlyMissing && participant.initiative != null) continue;
      if (participant.group && this.plugin.settings.groupInitiative) {
        if (!groups.has(participant.group)) groups.set(participant.group, roll(signed(participant.modifier)).total);
        participant.initiative = groups.get(participant.group) ?? null;
      } else participant.initiative = roll(signed(participant.modifier)).total;
    }
    this.log(this.strings.logInitiative);
    this.changed();
  }

  start(): void {
    const missing = this.combat.participants.filter(participant => participant.initiative == null);
    if (missing.length) {
      this.rollInitiative(true);
      new Notice(format(this.strings.initiativeRolledFor, { names: missing.map(participant => participant.name).join(", ") }));
    }
    this.combat.active = true;
    this.combat.round = 1;
    this.combat.turn = 0;
    this.log(format(this.strings.logRound, { round: 1 }));
    this.changed();
  }

  /** Moves to the next or previous turn, skipping defeated non-players. */
  advance(step = 1): void {
    if (!this.combat.active) return;
    const order = sortedParticipants(this.combat);
    if (!order.length) return;
    let turn = this.combat.turn, guard = 0;
    do {
      turn += step;
      if (turn >= order.length) { turn = 0; this.combat.round++; this.log(format(this.strings.logRound, { round: this.combat.round })); }
      if (turn < 0) { turn = order.length - 1; this.combat.round = Math.max(1, this.combat.round - 1); }
      guard++;
    } while (guard < order.length && order[turn].kind !== "player" && order[turn].hp <= 0);
    this.combat.turn = turn;
    this.combat.selected = order[turn].id;
    this.changed();
  }

  /** Positive amounts are damage, negative amounts are healing. Temporary hit points absorb damage first. */
  applyDamage(participant: Participant, amount: number): void {
    if (amount > 0) {
      let remaining = amount;
      if (participant.temporaryHp > 0) {
        const absorbed = Math.min(participant.temporaryHp, remaining);
        participant.temporaryHp -= absorbed;
        remaining -= absorbed;
      }
      participant.hp = Math.max(0, participant.hp - remaining);
      this.log(format(this.strings.logDamage, { name: participant.name, amount, hp: participant.hp, max: participant.hpMax }));
      if (participant.hp === 0) {
        this.log(format(this.strings.logFalls, { name: participant.name }));
        if (participant.kind === "player" && !participant.conditions.includes(DYING)) participant.conditions.push(DYING);
      }
    } else if (amount < 0) {
      participant.hp = Math.min(participant.hpMax, participant.hp - amount);
      participant.conditions = participant.conditions.filter(condition => condition !== DYING);
      this.log(format(this.strings.logHealing, { name: participant.name, amount: -amount, hp: participant.hp, max: participant.hpMax }));
    }
    this.changed();
  }

  setTemporaryHitPoints(participant: Participant, amount: number): void {
    participant.temporaryHp = Math.max(participant.temporaryHp, amount);
    this.log(format(this.strings.logTemporary, { name: participant.name, amount: participant.temporaryHp }));
    this.changed();
  }

  /**
   * Row input: "12" deals damage, "+5" heals, "t5" sets temporary hit points.
   * With `heal` set (Shift+Enter) a plain number heals. Returns false for invalid input.
   */
  applyRowInput(participant: Participant, raw: string, heal = false): boolean {
    const value = raw.trim().toLowerCase();
    if (!value) return true;
    const temporary = value.match(/^t\s*(\d+)$/);
    if (temporary) { this.setTemporaryHitPoints(participant, Number(temporary[1])); return true; }
    if (!/^\+?\d+$/.test(value)) { new Notice(this.strings.invalidAmount); return false; }
    const amount = Number(value.replace(/^\+/, ""));
    this.applyDamage(participant, value.startsWith("+") || heal ? -amount : amount);
    return true;
  }

  toggleCondition(participant: Participant, condition: string): void {
    participant.conditions = participant.conditions.includes(condition)
      ? participant.conditions.filter(value => value !== condition)
      : [...participant.conditions, condition];
    this.changed();
  }

  setHidden(participant: Participant, hidden: boolean): void {
    participant.hidden = hidden;
    this.changed();
  }

  update(participant: Participant, changes: Partial<Pick<Participant, "name" | "ac" | "hpMax" | "modifier" | "level" | "kind" | "note">>): void {
    Object.assign(participant, changes);
    participant.hp = Math.min(participant.hp, participant.hpMax);
    this.changed();
  }

  setInitiative(participant: Participant, initiative: number | null): void {
    participant.initiative = initiative;
    this.changed();
  }

  select(participant: Participant): void {
    this.combat.selected = participant.id;
    void this.plugin.save();
    this.plugin.refreshViews();
  }

  remove(participant: Participant): void {
    const order = sortedParticipants(this.combat);
    const index = order.findIndex(entry => entry.id === participant.id);
    this.combat.participants = this.combat.participants.filter(entry => entry.id !== participant.id);
    if (this.combat.active && index !== -1 && index < this.combat.turn) this.combat.turn--;
    if (this.combat.turn >= this.combat.participants.length) this.combat.turn = 0;
    if (this.combat.selected === participant.id) this.combat.selected = undefined;
    this.log(format(this.strings.logRemoved, { name: participant.name }));
    this.changed();
  }

  clear(): void {
    this.plugin.combat = newCombat(this.strings.defaultCombatName);
    this.changed();
  }

  logRoll(participant: Participant, result: Roll): string {
    const description = describeRoll(result, { critical: this.strings.rollCritical, naturalOne: this.strings.rollNaturalOne });
    this.log(format(this.strings.logRoll, { name: participant.name, roll: description }));
    this.changed();
    return description;
  }

  difficulty(): Difficulty | null {
    const players = this.combat.participants.filter(participant => participant.kind === "player");
    const enemies = this.combat.participants.filter(participant => participant.kind === "enemy");
    if (!players.length || !enemies.length) return null;
    const xp = enemies.reduce((sum, participant) => sum + (participant.xp ?? 0), 0);
    const adjustedXp = Math.round(xp * encounterMultiplier(enemies.length));
    const thresholds = [0, 0, 0, 0];
    for (const player of players) {
      const row = THRESHOLDS[Math.min(20, Math.max(1, player.level || 1))];
      for (let index = 0; index < 4; index++) thresholds[index] += row[index];
    }
    const level: DifficultyLevel = adjustedXp >= thresholds[3] ? "deadly" : adjustedXp >= thresholds[2] ? "hard"
      : adjustedXp >= thresholds[1] ? "medium" : adjustedXp >= thresholds[0] ? "easy" : "trivial";
    return { xp, adjustedXp, level, thresholds, players: players.length };
  }

  difficultyLabel(level: DifficultyLevel): string {
    return { trivial: this.strings.difficultyTrivial, easy: this.strings.difficultyEasy, medium: this.strings.difficultyMedium, hard: this.strings.difficultyHard, deadly: this.strings.difficultyDeadly }[level];
  }

  /** Plain-English combat summary sent to the assistant as context. */
  summary(): string {
    if (!this.combat.participants.length) return "";
    const lines = sortedParticipants(this.combat).map((participant, index) => {
      const current = this.combat.active && index === this.combat.turn ? "> " : "";
      const conditions = participant.conditions.length ? ` [${participant.conditions.join(", ")}]` : "";
      const temporary = participant.temporaryHp ? `+${participant.temporaryHp}` : "";
      const note = participant.note ? ` - ${participant.note}` : "";
      return `${current}${participant.name} (${participant.kind}) - initiative ${participant.initiative ?? "?"}, AC ${participant.ac}, HP ${participant.hp}/${participant.hpMax}${temporary}${conditions}${note}`;
    });
    const status = this.combat.active ? "" : " (not started)";
    return `Combat "${this.combat.name}", round ${this.combat.round}${status}:\n${lines.join("\n")}\nRecent events:\n${this.combat.log.slice(-8).join("\n")}`;
  }

  /** Markdown callout with the initiative table and the recent log. */
  exportMarkdown(): string {
    const rows = sortedParticipants(this.combat).map(participant => {
      const name = participant.source ? `[[${(participant.source.split("/").pop() ?? "").replace(/\.md$/, "")}\\|${participant.name}]]` : participant.name;
      const conditions = participant.conditions.map(condition => conditionLabel(this.strings, condition)).join(", ");
      return `| ${participant.initiative ?? ""} | ${name} | ${participant.ac} | ${participant.hp}/${participant.hpMax} | ${conditions} |`;
    });
    const difficulty = this.difficulty();
    const difficultyText = difficulty ? format(this.strings.exportDifficulty, { level: this.difficultyLabel(difficulty.level), xp: difficulty.xp }) : "";
    const heading = format(this.strings.exportHeading, { name: this.combat.name, round: this.combat.round });
    const log = this.combat.log.slice(-12).map(entry => `- ${entry}`).join("\n> ");
    return `\n> [!note]- ${heading}${difficultyText}\n> ${this.strings.exportColumns}\n> |---|---|---|---|---|\n${rows.map(row => "> " + row).join("\n")}\n>\n> ${log}\n`;
  }

  async exportToActiveNote(): Promise<void> {
    const markdown = this.exportMarkdown();
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file ?? this.plugin.app.workspace.getActiveFile();
    if (!file) {
      await navigator.clipboard?.writeText?.(markdown);
      new Notice(this.strings.exportCopied);
      return;
    }
    await this.plugin.app.vault.append(file, markdown);
    new Notice(format(this.strings.exportSaved, { note: file.basename }));
  }

  saveEncounterSet(name: string, description: string): boolean {
    const enemies = this.combat.participants.filter(participant => participant.kind === "enemy" && participant.source);
    if (!enemies.length) return false;
    const members = new Map<string, EncounterMember>();
    for (const participant of enemies) {
      const source = participant.source as string;
      const member = members.get(source) ?? { source, name: participant.group ?? participant.name, quantity: 0, group: !!participant.group };
      member.quantity++;
      members.set(source, member);
    }
    this.plugin.encounterSets.push({ name: name || this.strings.defaultSetName, description, members: [...members.values()] });
    void this.plugin.save();
    new Notice(this.strings.encounterSetSaved);
    return true;
  }

  async loadEncounterSet(set: EncounterSet): Promise<void> {
    for (const member of set.members) {
      const file = this.plugin.app.vault.getAbstractFileByPath(member.source);
      if (file instanceof TFile) await this.addCreature(file, member.quantity, member.group);
      else new Notice(format(this.strings.noteMissing, { path: member.source }));
    }
  }

  deleteEncounterSet(set: EncounterSet): void {
    this.plugin.encounterSets = this.plugin.encounterSets.filter(entry => entry !== set);
    void this.plugin.save();
  }
}

/** Appends a log entry, rendering **text** as bold without using innerHTML. */
function appendLogEntry(list: HTMLElement, entry: string): void {
  const item = list.createEl("li");
  entry.split(/(\*\*.+?\*\*)/g).forEach(part => {
    if (!part) return;
    if (part.startsWith("**") && part.endsWith("**")) item.createEl("b", { text: part.slice(2, -2) });
    else item.appendText(part);
  });
}

export class CombatView extends ItemView {
  constructor(leaf: WorkspaceLeaf, readonly plugin: TableTools) { super(leaf); }

  getViewType(): string { return COMBAT_VIEW; }
  getDisplayText(): string { return this.plugin.strings.combatTitle; }
  getIcon(): string { return "swords"; }

  async onOpen(): Promise<void> { this.plugin.views.add(this); this.render(); }
  async onClose(): Promise<void> { this.plugin.views.delete(this); }

  private get tracker(): CombatTracker { return this.plugin.tracker; }
  private get strings(): Strings { return this.plugin.strings; }

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("tt-combat");
    const combat = this.plugin.combat;
    const s = this.strings;
    const order = sortedParticipants(combat);

    const toolbar = root.createDiv("tt-toolbar");
    const button = (icon: string, label: string, onClick: () => void, cls = ""): HTMLElement => {
      const element = toolbar.createEl("button", { cls: "tt-btn " + cls, attr: { "aria-label": label } });
      setIcon(element.createSpan("tt-btn-icon"), icon);
      element.createSpan({ text: label });
      element.onclick = onClick;
      return element;
    };
    button("users", s.toolbarPlayers, () => new AddPlayersModal(this.app, this.plugin).open());
    button("skull", s.toolbarEnemy, () => new CreaturePickerModal(this.app, this.plugin).open());
    button("dices", s.toolbarInitiative, () => this.tracker.rollInitiative(false));
    if (!combat.active) button("play", s.toolbarStart, () => this.tracker.start(), "tt-btn-primary");
    else {
      button("skip-back", s.toolbarPrevious, () => this.tracker.advance(-1));
      button("skip-forward", s.toolbarNext, () => this.tracker.advance(1), "tt-btn-primary");
    }
    const round = toolbar.createDiv("tt-round");
    round.createSpan({ cls: "tt-round-label", text: s.roundLabel });
    round.createSpan({ cls: "tt-round-number", text: combat.round ? String(combat.round) : "\u2014" });
    const right = toolbar.createDiv("tt-toolbar-right");
    const iconButton = (icon: string, title: string, onClick: () => void): void => {
      const element = right.createEl("button", { cls: "tt-btn tt-btn-icon-only", attr: { "aria-label": title, title } });
      setIcon(element, icon);
      element.onclick = onClick;
    };
    iconButton("layers", s.encounterSetsTitle, () => new EncounterSetsModal(this.app, this.plugin).open());
    iconButton("file-down", s.exportToNote, () => void this.tracker.exportToActiveNote());
    iconButton("rotate-ccw", s.newCombat, () => {
      if (!combat.participants.length) this.tracker.clear();
      else new ConfirmModal(this.app, s, s.confirmClear, s.confirmClearAction, () => this.tracker.clear()).open();
    });

    const difficulty = this.tracker.difficulty();
    if (difficulty) {
      const bar = root.createDiv("tt-difficulty tt-difficulty-" + difficulty.level);
      bar.createSpan({ cls: "tt-difficulty-level", text: this.tracker.difficultyLabel(difficulty.level) });
      bar.createSpan({ text: " " + format(s.difficultyDetail, { xp: difficulty.xp, adjusted: difficulty.adjustedXp, players: difficulty.players, thresholds: difficulty.thresholds.join(" / ") }) });
    }

    if (!order.length) {
      const empty = root.createDiv("tt-empty");
      empty.createEl("p", { text: s.emptyCombat });
      empty.createEl("p", { cls: "tt-muted", text: s.emptyCombatHint });
    } else {
      const table = root.createEl("table", { cls: "tt-table" });
      const head = table.createEl("thead").createEl("tr");
      for (const title of ["", s.columnInitiative, s.columnName, s.columnAc, s.columnHp, s.columnDamage, s.columnConditions, ""]) head.createEl("th", { text: title });
      const body = table.createEl("tbody");
      order.forEach((participant, index) => this.renderRow(body, participant, combat.active && index === combat.turn));
    }

    const bottom = root.createDiv("tt-bottom");
    const card = bottom.createDiv("tt-card");
    const selected = combat.participants.find(participant => participant.id === combat.selected);
    if (selected?.statblock) this.renderCard(card, selected);
    else if (selected) {
      card.createDiv({ cls: "tt-card-header" }).createEl("h3", { text: selected.name });
      card.createEl("p", { cls: "tt-muted", text: selected.source ? s.noStatblock : s.manualParticipant });
      if (selected.source) {
        const link = card.createEl("a", { text: s.openNote, href: "#" });
        const source = selected.source;
        link.onclick = () => void this.app.workspace.openLinkText(source, "", true);
      }
    } else card.createEl("p", { cls: "tt-muted", text: s.selectRowHint });
    const log = bottom.createDiv("tt-log");
    log.createDiv({ cls: "tt-log-title", text: s.logTitle });
    const list = log.createEl("ul");
    for (const entry of [...combat.log].reverse().slice(0, 40)) appendLogEntry(list, entry);
  }

  private renderRow(body: HTMLElement, participant: Participant, current: boolean): void {
    const s = this.strings;
    const combat = this.plugin.combat;
    const classes = ["tt-row", `tt-${participant.kind}`];
    if (current) classes.push("tt-current");
    if (participant.hp <= 0) classes.push("tt-defeated");
    if (combat.selected === participant.id) classes.push("tt-selected");
    if (participant.hidden) classes.push("tt-hidden");
    const row = body.createEl("tr", { cls: classes.join(" ") });
    row.onclick = event => {
      if ((event.target as HTMLElement | null)?.closest?.("input,button,select")) return;
      this.tracker.select(participant);
    };

    const marker = row.createEl("td", { cls: "tt-col-marker" });
    if (current) setIcon(marker.createSpan("tt-arrow"), "chevron-right");

    const initiativeCell = row.createEl("td", { cls: "tt-col-initiative" });
    const initiative = initiativeCell.createEl("input", {
      type: "number", cls: "tt-input-initiative", value: participant.initiative == null ? "" : String(participant.initiative),
      attr: { placeholder: "\u2014", title: format(s.modifierTitle, { modifier: signed(participant.modifier) }) },
    });
    initiative.onchange = () => this.tracker.setInitiative(participant, initiative.value === "" ? null : Number(initiative.value));

    const nameCell = row.createEl("td", { cls: "tt-col-name" });
    const name = nameCell.createDiv("tt-name");
    name.createSpan({ cls: "tt-kind-dot tt-dot-" + participant.kind });
    name.createSpan({ cls: "tt-name-text", text: participant.name });
    if (participant.cr) name.createSpan({ cls: "tt-chip tt-chip-cr", text: format(s.chipCr, { cr: participant.cr }) });
    if (participant.level) name.createSpan({ cls: "tt-chip", text: format(s.chipLevel, { level: participant.level }) });
    if (participant.note) nameCell.createDiv({ cls: "tt-note", text: participant.note });

    row.createEl("td", { cls: "tt-col-ac" }).createSpan({ cls: "tt-shield", text: String(participant.ac) });

    const hpCell = row.createEl("td", { cls: "tt-col-hp" });
    const bar = hpCell.createDiv("tt-hp-bar");
    const percent = participant.hpMax ? Math.max(0, Math.min(100, Math.round(participant.hp / participant.hpMax * 100))) : 0;
    const fill = bar.createDiv("tt-hp-fill");
    fill.style.width = percent + "%";
    fill.addClass(percent > 50 ? "tt-hp-healthy" : percent > 25 ? "tt-hp-wounded" : "tt-hp-critical");
    const hpText = hpCell.createDiv("tt-hp-text");
    hpText.createSpan({ cls: "tt-hp-current", text: String(participant.hp) });
    hpText.createSpan({ cls: "tt-muted", text: ` / ${participant.hpMax}` });
    if (participant.temporaryHp) hpText.createSpan({ cls: "tt-chip tt-chip-temporary", text: `+${participant.temporaryHp}` });

    const damageCell = row.createEl("td", { cls: "tt-col-damage" });
    const damage = damageCell.createEl("input", { type: "text", cls: "tt-input-damage", attr: { placeholder: s.damagePlaceholder, title: s.damageTitle } });
    damage.onkeydown = event => {
      if (event.key !== "Enter") return;
      if (this.tracker.applyRowInput(participant, damage.value, event.shiftKey)) damage.value = "";
    };

    const conditionsCell = row.createEl("td", { cls: "tt-col-conditions" });
    for (const condition of participant.conditions) {
      const chip = conditionsCell.createSpan({
        cls: "tt-chip tt-chip-condition", text: conditionLabel(s, condition),
        attr: { title: format(s.conditionChipTitle, { description: conditionDescription(s, condition) }) },
      });
      chip.onclick = event => { event.stopPropagation(); this.tracker.toggleCondition(participant, condition); };
    }
    const add = conditionsCell.createEl("button", { cls: "tt-btn-mini", attr: { title: s.addCondition, "aria-label": s.addCondition } });
    setIcon(add, "plus");
    add.onclick = event => { event.stopPropagation(); new ConditionsModal(this.app, this.plugin, participant).open(); };

    const actions = row.createEl("td", { cls: "tt-col-actions" });
    const mini = (icon: string, title: string, onClick: () => void): void => {
      const element = actions.createEl("button", { cls: "tt-btn-mini", attr: { title, "aria-label": title } });
      setIcon(element, icon);
      element.onclick = event => { event.stopPropagation(); onClick(); };
    };
    mini("pencil", s.editParticipant, () => new EditParticipantModal(this.app, this.plugin, participant).open());
    mini(participant.hidden ? "eye-off" : "eye", participant.hidden ? s.hiddenFromPlayers : s.visibleToPlayers, () => this.tracker.setHidden(participant, !participant.hidden));
    mini("x", s.removeParticipant, () => this.tracker.remove(participant));
  }

  private renderCard(element: HTMLElement, participant: Participant): void {
    const s = this.strings;
    const statblock = participant.statblock;
    if (!statblock) return;
    const pattern = dicePattern(this.plugin.settings.attackBonusPhrases);
    const onRoll = (_expression: string, result: Roll): void => {
      const description = this.tracker.logRoll(participant, result);
      new Notice(description.replace(/\*\*/g, ""));
    };
    const highlight = (target: HTMLElement, text: string): void => highlightDice(target, text, pattern, s.clickToRoll, onRoll);

    const header = element.createDiv("tt-card-header");
    header.createEl("h3", { text: statblock.name ?? participant.name });
    header.createDiv({ cls: "tt-card-subtitle", text: [statblock.size, statblock.type, statblock.subtype ? `(${statblock.subtype})` : "", statblock.alignment].filter(Boolean).join(" ") });
    if (participant.source) {
      const source = participant.source;
      const link = header.createEl("a", { cls: "tt-card-link", text: s.cardNoteLink });
      link.onclick = () => void this.app.workspace.openLinkText(source, "", true);
    }

    const key = element.createDiv("tt-card-key");
    const keyValue = (label: string, value: string): void => {
      const item = key.createDiv("tt-key-value");
      item.createSpan({ cls: "tt-key", text: label });
      highlight(item.createSpan("tt-value"), value);
    };
    keyValue(s.cardAc, `${statblock.ac ?? "?"}${statblock.ac_class ? ` (${statblock.ac_class})` : ""}`);
    keyValue(s.cardHp, `${participant.hp}/${participant.hpMax}${statblock.hit_dice ? ` (${statblock.hit_dice})` : ""}`);
    if (statblock.speed) keyValue(s.cardSpeed, String(statblock.speed));

    const stats = statblock.stats;
    if (stats?.length === 6) {
      const grid = element.createDiv("tt-abilities");
      [s.abilityStrength, s.abilityDexterity, s.abilityConstitution, s.abilityIntelligence, s.abilityWisdom, s.abilityCharisma].forEach((label, index) => {
        const cell = grid.createDiv("tt-ability");
        cell.createDiv({ cls: "tt-ability-name", text: label });
        cell.createDiv({ cls: "tt-ability-score", text: String(stats[index]) });
        const modifier = abilityModifier(stats[index]);
        const bonus = cell.createDiv({ cls: "tt-ability-modifier tt-die", text: signed(modifier), attr: { title: s.rollAbilityTitle } });
        bonus.onclick = () => onRoll(`d20${signed(modifier)}`, roll(signed(modifier)));
      });
    }

    const info = element.createDiv("tt-card-info");
    const line = (label: string, value?: string): void => {
      if (!value) return;
      const item = info.createDiv("tt-line");
      item.createSpan({ cls: "tt-line-label", text: label + " " });
      highlight(item.createSpan(), value);
    };
    line(s.lineSaves, savesText(statblock.saves));
    line(s.lineSkills, savesText(statblock.skillsaves));
    line(s.lineVulnerabilities, statblock.damage_vulnerabilities);
    line(s.lineResistances, statblock.damage_resistances);
    line(s.lineImmunities, statblock.damage_immunities);
    line(s.lineConditionImmunities, statblock.condition_immunities);
    line(s.lineSenses, statblock.senses);
    line(s.lineLanguages, statblock.languages);
    if (statblock.cr != null) line(s.lineChallenge, format(s.challengeValue, { cr: statblock.cr, xp: experienceForChallenge(statblock.cr) }));

    const section = (title: string, traits?: Trait[]): void => {
      if (!traits?.length) return;
      const block = element.createDiv("tt-section");
      block.createDiv({ cls: "tt-section-title", text: title });
      for (const trait of traits) {
        const paragraph = block.createDiv("tt-trait");
        paragraph.createSpan({ cls: "tt-trait-name", text: (trait.name ?? "") + ". " });
        highlight(paragraph.createSpan(), String(trait.desc ?? ""));
      }
    };
    section(s.sectionTraits, statblock.traits);
    section(s.sectionActions, statblock.actions);
    section(s.sectionBonusActions, statblock.bonus_actions);
    section(s.sectionReactions, statblock.reactions);
    section(s.sectionLegendaryActions, statblock.legendary_actions);
    section(s.sectionLairActions, statblock.lair_actions);
    section(s.sectionHomebrew, statblock.homebrew_notes);
  }
}

class CreaturePickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly plugin: TableTools) {
    super(app);
    this.setPlaceholder(plugin.strings.searchBestiary);
  }
  getItems(): TFile[] { return creatureFiles(this.app, this.plugin.bestiaryPaths()); }
  getItemText(file: TFile): string {
    const cr = this.app.metadataCache.getFileCache(file)?.frontmatter?.cr;
    return cr != null ? format(this.plugin.strings.creatureOption, { name: file.basename, cr }) : file.basename;
  }
  onChooseItem(file: TFile): void { new QuantityModal(this.app, this.plugin, file).open(); }
}

class QuantityModal extends Modal {
  constructor(app: App, private readonly plugin: TableTools, private readonly file: TFile) { super(app); }
  onOpen(): void {
    const s = this.plugin.strings;
    const { contentEl } = this;
    contentEl.addClass("tt-modal");
    contentEl.createEl("h3", { text: this.file.basename });
    let quantity = 1, shareInitiative = true;
    new Setting(contentEl).setName(s.quantity).addSlider(slider => slider.setLimits(1, 12, 1).setValue(1).setDynamicTooltip().onChange(value => { quantity = value; }));
    new Setting(contentEl).setName(s.sharedInitiativeForGroup).addToggle(toggle => toggle.setValue(true).onChange(value => { shareInitiative = value; }));
    new Setting(contentEl).addButton(button => button.setButtonText(s.add).setCta().onClick(async () => {
      await this.plugin.tracker.addCreature(this.file, quantity, shareInitiative);
      this.close();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

interface TrackerPlayer { name: string; ac?: number; hp?: number; modifier?: number; level?: number; note?: string }

class AddPlayersModal extends Modal {
  constructor(app: App, private readonly plugin: TableTools) { super(app); }
  async onOpen(): Promise<void> {
    const s = this.plugin.strings;
    const { contentEl } = this;
    contentEl.addClass("tt-modal");
    contentEl.createEl("h3", { text: s.addPlayersTitle });
    const files = playerFiles(this.app, this.plugin.partyPath());
    const selected = new Set<string>(files.map(file => file.path));
    if (files.length) {
      contentEl.createEl("p", { cls: "tt-muted", text: s.fromPartyNotes });
      for (const file of files) {
        const fields = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        new Setting(contentEl).setName(file.basename)
          .setDesc(format(s.playerSummary, { ac: fields.ac ?? "?", hp: fields.hp ?? "?", modifier: signed(Number(fields.init_mod ?? 0)), level: fields.level ?? "?" }))
          .addToggle(toggle => toggle.setValue(true).onChange(value => { if (value) selected.add(file.path); else selected.delete(file.path); }));
      }
    }
    let trackerPlayers: TrackerPlayer[] = [];
    try {
      const raw = await this.app.vault.adapter.read(this.app.vault.configDir + "/plugins/initiative-tracker/data.json");
      trackerPlayers = (JSON.parse(raw) as { players?: TrackerPlayer[] }).players ?? [];
    } catch { /* Initiative Tracker is not installed. */ }
    const selectedTracker = new Set<string>();
    if (trackerPlayers.length) {
      contentEl.createEl("p", { cls: "tt-muted", text: s.fromInitiativeTracker });
      for (const player of trackerPlayers) {
        new Setting(contentEl).setName(player.name)
          .setDesc(format(s.playerSummary, { ac: player.ac ?? "?", hp: player.hp ?? "?", modifier: signed(player.modifier ?? 0), level: player.level ?? "?" }))
          .addToggle(toggle => toggle.setValue(false).onChange(value => { if (value) selectedTracker.add(player.name); else selectedTracker.delete(player.name); }));
      }
    }
    contentEl.createEl("p", { cls: "tt-muted", text: s.manualEntry });
    let name = "", ac = 14, hp = 30, modifier = 2, level = 3;
    new Setting(contentEl).setName(s.nameLabel).addText(text => text.onChange(value => { name = value; }));
    new Setting(contentEl).setName(s.playerNumbers)
      .addText(text => text.setValue("14").onChange(value => { ac = Number(value); }))
      .addText(text => text.setValue("30").onChange(value => { hp = Number(value); }))
      .addText(text => text.setValue("2").onChange(value => { modifier = Number(value); }))
      .addText(text => text.setValue("3").onChange(value => { level = Number(value); }));
    new Setting(contentEl).addButton(button => button.setButtonText(s.addSelected).setCta().onClick(() => {
      const tracker = this.plugin.tracker;
      for (const file of files) {
        if (!selected.has(file.path)) continue;
        const fields = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        tracker.addPlayer({ name: file.basename, ac: Number(fields.ac ?? 10), hp: Number(fields.hp ?? 10), modifier: Number(fields.init_mod ?? 0), level: Number(fields.level ?? 1), source: file.path });
      }
      for (const player of trackerPlayers) {
        if (selectedTracker.has(player.name)) tracker.addPlayer({ name: player.name, ac: Number(player.ac ?? 10), hp: Number(player.hp ?? 10), modifier: Number(player.modifier ?? 0), level: Number(player.level ?? 1), source: player.note });
      }
      if (name.trim()) tracker.addPlayer({ name: name.trim(), ac, hp, modifier, level });
      this.close();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

class ConditionsModal extends Modal {
  constructor(app: App, private readonly plugin: TableTools, private readonly participant: Participant) { super(app); }
  onOpen(): void {
    const s = this.plugin.strings;
    const { contentEl } = this;
    contentEl.addClass("tt-modal");
    contentEl.createEl("h3", { text: format(s.conditionsTitle, { name: this.participant.name }) });
    const grid = contentEl.createDiv("tt-conditions-grid");
    const pending = new Set(this.participant.conditions);
    for (const condition of CONDITIONS) {
      const toggle = grid.createEl("button", {
        cls: "tt-condition-button" + (pending.has(condition) ? " tt-condition-on" : ""),
        text: conditionLabel(s, condition), attr: { title: conditionDescription(s, condition) },
      });
      toggle.onclick = () => {
        if (pending.has(condition)) pending.delete(condition); else pending.add(condition);
        toggle.toggleClass("tt-condition-on", pending.has(condition));
      };
    }
    new Setting(contentEl).addButton(button => button.setButtonText(s.done).setCta().onClick(() => {
      for (const condition of CONDITIONS) {
        if (pending.has(condition) !== this.participant.conditions.includes(condition)) this.plugin.tracker.toggleCondition(this.participant, condition);
      }
      this.close();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

class EditParticipantModal extends Modal {
  constructor(app: App, private readonly plugin: TableTools, private readonly participant: Participant) { super(app); }
  onOpen(): void {
    const s = this.plugin.strings;
    const participant = this.participant;
    const changes: { name: string; ac: number; hpMax: number; modifier: number; level?: number; kind: ParticipantKind; note: string } = {
      name: participant.name, ac: participant.ac, hpMax: participant.hpMax, modifier: participant.modifier, level: participant.level, kind: participant.kind, note: participant.note,
    };
    const { contentEl } = this;
    contentEl.addClass("tt-modal");
    contentEl.createEl("h3", { text: s.editTitle });
    new Setting(contentEl).setName(s.nameLabel).addText(text => text.setValue(changes.name).onChange(value => { changes.name = value; }));
    new Setting(contentEl).setName(s.cardAc).addText(text => text.setValue(String(changes.ac)).onChange(value => { changes.ac = Number(value) || 10; }));
    new Setting(contentEl).setName(s.editMaximumHp).addText(text => text.setValue(String(changes.hpMax)).onChange(value => { changes.hpMax = Number(value) || 1; }));
    new Setting(contentEl).setName(s.editInitiativeModifier).addText(text => text.setValue(String(changes.modifier)).onChange(value => { changes.modifier = Number(value) || 0; }));
    if (participant.kind === "player") new Setting(contentEl).setName(s.editLevel).addText(text => text.setValue(String(changes.level ?? 1)).onChange(value => { changes.level = Number(value) || 1; }));
    new Setting(contentEl).setName(s.editKind).addDropdown(dropdown => dropdown
      .addOptions({ player: s.kindPlayer, enemy: s.kindEnemy, ally: s.kindAlly })
      .setValue(changes.kind)
      .onChange(value => { changes.kind = value as ParticipantKind; }));
    new Setting(contentEl).setName(s.editNote).setDesc(s.editNoteHint).addTextArea(text => text.setValue(changes.note).onChange(value => { changes.note = value; }));
    new Setting(contentEl).addButton(button => button.setButtonText(s.save).setCta().onClick(() => {
      this.plugin.tracker.update(participant, changes);
      this.close();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

class EncounterSetsModal extends Modal {
  constructor(app: App, private readonly plugin: TableTools) { super(app); }
  onOpen(): void {
    const s = this.plugin.strings;
    const tracker = this.plugin.tracker;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("tt-modal");
    contentEl.createEl("h3", { text: s.encounterSetsTitle });
    contentEl.createEl("p", { cls: "tt-muted", text: s.encounterSetsHint });
    const sets = this.plugin.encounterSets;
    if (!sets.length) contentEl.createEl("p", { text: s.noEncounterSets });
    for (const set of sets) {
      const members = set.members.map(member => format(s.memberSummary, { name: member.name, quantity: member.quantity })).join(", ");
      new Setting(contentEl).setName(set.name).setDesc(members + (set.description ? " \u2014 " + set.description : ""))
        .addButton(button => button.setButtonText(s.load).setCta().onClick(async () => { await tracker.loadEncounterSet(set); this.close(); }))
        .addExtraButton(button => button.setIcon("trash").setTooltip(s.deleteEncounterSet).onClick(() => { tracker.deleteEncounterSet(set); this.onOpen(); }));
    }
    const enemies = this.plugin.combat.participants.filter(participant => participant.kind === "enemy" && participant.source);
    if (enemies.length) {
      contentEl.createEl("h4", { text: s.saveCurrentEnemies });
      let name = this.plugin.combat.name, description = "";
      new Setting(contentEl).setName(s.nameLabel).addText(text => text.setValue(name).onChange(value => { name = value; }));
      new Setting(contentEl).setName(s.descriptionLabel).addText(text => text.onChange(value => { description = value; }));
      new Setting(contentEl).addButton(button => button.setButtonText(s.saveEncounterSet).onClick(() => {
        if (tracker.saveEncounterSet(name, description)) this.close();
      }));
    }
  }
  onClose(): void { this.contentEl.empty(); }
}

export class ConfirmModal extends Modal {
  constructor(app: App, private readonly strings: Strings, private readonly message: string, private readonly action: string, private readonly onConfirm: () => void) { super(app); }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("tt-modal");
    contentEl.createEl("p", { text: this.message });
    new Setting(contentEl)
      .addButton(button => button.setButtonText(this.strings.cancel).onClick(() => this.close()))
      .addButton(button => button.setButtonText(this.action).setWarning().onClick(() => { this.onConfirm(); this.close(); }));
  }
  onClose(): void { this.contentEl.empty(); }
}
