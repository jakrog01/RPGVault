import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { AssistantView, ASSISTANT_VIEW } from "./assistant";
import { CombatView, COMBAT_VIEW, newCombat } from "./combat";
import { createStrings, englishStrings, Strings } from "./strings";
import { Combat, DEFAULTS, EncounterSet, Settings } from "./types";
import { listModels } from "./gemini";

interface PluginData { settings: Settings; combat: Combat; encounterSets: EncounterSet[] }
export interface RunContext { run: TFile; campaign: TFile; party: TFile; state: TFile; day: TFile | null }

export default class TableTools extends Plugin {
  settings: Settings = { ...DEFAULTS };
  combat: Combat = newCombat();
  encounterSets: EncounterSet[] = [];
  strings: Strings = englishStrings;

  async onload(): Promise<void> {
    await this.loadStrings();
    await this.load();
    this.registerView(COMBAT_VIEW, leaf => new CombatView(leaf, this));
    this.registerView(ASSISTANT_VIEW, leaf => new AssistantView(leaf, this));
    this.addRibbonIcon("swords", this.strings.openCombat, () => void this.openView(COMBAT_VIEW));
    this.addRibbonIcon("sparkles", this.strings.openAssistant, () => void this.openView(ASSISTANT_VIEW));
    this.addCommand({ id: "open-combat", name: this.strings.openCombat, callback: () => void this.openView(COMBAT_VIEW) });
    this.addCommand({ id: "open-assistant", name: this.strings.openAssistant, callback: () => void this.openView(ASSISTANT_VIEW) });
    this.addCommand({ id: "combat-next-turn", name: this.strings.nextTurn, callback: () => this.combat.active && this.view<CombatView>(COMBAT_VIEW)?.advance(1) });
    this.addCommand({ id: "combat-previous-turn", name: this.strings.previousTurn, callback: () => this.combat.active && this.view<CombatView>(COMBAT_VIEW)?.advance(-1) });
    this.addCommand({ id: "combat-roll-initiative", name: this.strings.rollInitiative, callback: () => this.view<CombatView>(COMBAT_VIEW)?.rollInitiative() });
    this.addCommand({ id: "combat-clear", name: this.strings.clearCombat, callback: () => { this.combat = newCombat(); void this.save(); } });
    this.addCommand({ id: "assistant-selected-text", name: this.strings.selectedText, editorCallback: async editor => { const selection = editor.getSelection(); if (!selection) return new Notice(this.strings.selectText); await this.openView(ASSISTANT_VIEW); await this.view<AssistantView>(ASSISTANT_VIEW)?.send(selection); } });
    this.addSettingTab(new TableToolsSettings(this.app, this));
  }
  async load(): Promise<void> { const data = await this.loadData() as Partial<PluginData> | null; this.settings = { ...DEFAULTS, ...(data?.settings ?? {}) }; this.combat = data?.combat ?? newCombat(); this.encounterSets = data?.encounterSets ?? []; }
  async save(): Promise<void> { await this.saveData({ settings: this.settings, combat: this.combat, encounterSets: this.encounterSets } satisfies PluginData); }
  async loadStrings(): Promise<void> { try { const file = this.app.vault.getAbstractFileByPath("_local/plugins/table-tools/strings.json"); if (!(file instanceof TFile)) return; this.strings = createStrings(JSON.parse(await this.app.vault.cachedRead(file))); } catch { new Notice("Table Tools could not load the local string override; English strings are in use."); this.strings = englishStrings; } }
  async openView(type: string): Promise<void> { const current = this.app.workspace.getLeavesOfType(type)[0]; if (current) return void this.app.workspace.revealLeaf(current); const leaf = this.app.workspace.getRightLeaf(false); if (!leaf) return; await leaf.setViewState({ type, active: true }); this.app.workspace.revealLeaf(leaf); }
  view<T>(type: string): T | undefined { return this.app.workspace.getLeavesOfType(type)[0]?.view as T | undefined; }
  private linkPath(value: unknown): string { return String(value ?? "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0]; }
  private resolve(value: unknown, source: TFile): TFile | null { return this.app.metadataCache.getFirstLinkpathDest(this.linkPath(value), source.path); }
  currentContext(): RunContext | null { const pointer = this.app.vault.getAbstractFileByPath(this.settings.activePointerPath); if (!(pointer instanceof TFile)) return null; const run = this.resolve(this.app.metadataCache.getFileCache(pointer)?.frontmatter?.run, pointer); if (!run) return null; const fields = this.app.metadataCache.getFileCache(run)?.frontmatter ?? {}; const campaign = this.resolve(fields.campaign, run), party = this.resolve(fields.party, run); const folder = run.parent?.path; const state = folder ? this.app.vault.getAbstractFileByPath(`${folder}/State.md`) : null; const day = folder ? this.app.vault.getAbstractFileByPath(`${folder}/World Day.md`) : null; return campaign && party && state instanceof TFile ? { run, campaign, party, state, day: day instanceof TFile ? day : null } : null; }
  partyPath(): string { return this.settings.partyPath || this.currentContext()?.party.parent?.path || ""; }
  bestiaryPaths(): string[] { if (this.settings.bestiaryPath) return [this.settings.bestiaryPath]; const context = this.currentContext(); const system = String(context ? this.app.metadataCache.getFileCache(context.campaign)?.frontmatter?.system ?? "generic" : "generic"); return [`Library/Mechanics/${system}/Bestiary`, ...(context?.campaign.parent ? [`${context.campaign.parent.path}/Mechanics/Bestiary`] : [])]; }
}

class TableToolsSettings extends PluginSettingTab {
  constructor(app: App, readonly plugin: TableTools) { super(app, plugin); }
  display(): void {
    const root = this.containerEl; root.empty(); const settings = this.plugin.settings; const save = () => void this.plugin.save(); const text = (name: string, value: keyof Settings, description = "") => new Setting(root).setName(name).setDesc(description).addText(input => input.setValue(String(settings[value])).onChange(next => { (settings[value] as string) = next; save(); }));
    new Setting(root).setName(this.plugin.strings.apiKey).setDesc(this.plugin.strings.apiKeyDescription).addText(input => { input.inputEl.type = "password"; input.setValue(settings.apiKey).onChange(value => { settings.apiKey = value.trim(); save(); }); });
    new Setting(root).setName(this.plugin.strings.model).addDropdown(dropdown => { for (const model of settings.models) dropdown.addOption(model, model); dropdown.setValue(settings.model).onChange(value => { settings.model = value; save(); }); }).addButton(button => button.setButtonText(this.plugin.strings.fetchModels).onClick(async () => { try { settings.models = await listModels(settings.apiKey); save(); this.display(); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); } }));
    new Setting(root).setName(this.plugin.strings.temperature).addSlider(slider => slider.setLimits(0, 1.5, 0.1).setValue(settings.temperature).onChange(value => { settings.temperature = value; save(); }));
    new Setting(root).setName(this.plugin.strings.systemPrompt).addTextArea(input => input.setValue(settings.systemPrompt).onChange(value => { settings.systemPrompt = value; save(); }));
    text(this.plugin.strings.contextLimit, "maxContext"); text(this.plugin.strings.activePointer, "activePointerPath"); text(this.plugin.strings.campaignOverride, "campaignPath"); text(this.plugin.strings.dayOverride, "worldDayPath"); text(this.plugin.strings.bestiaryOverride, "bestiaryPath"); text(this.plugin.strings.partyOverride, "partyPath");
    for (const [name, key] of [[this.plugin.strings.averageHitPoints, "useAverageHitPoints"], [this.plugin.strings.sharedInitiative, "groupInitiative"]] as const) new Setting(root).setName(name).addToggle(toggle => toggle.setValue(settings[key]).onChange(value => { settings[key] = value; save(); }));
  }
}
