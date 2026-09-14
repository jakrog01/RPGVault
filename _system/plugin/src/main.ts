import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
import { AssistantView, ASSISTANT_VIEW } from "./assistant";
import { CombatTracker, CombatView, COMBAT_VIEW, newCombat } from "./combat";
import { listModels } from "./gemini";
import { createStrings, englishStrings, format, Strings } from "./strings";
import { Combat, DEFAULTS, EncounterSet, ScopePolicy, Settings, SourceKind } from "./types";
import { AssistantIndex } from "./indexer";
import { Skill, loadSkills } from "./tools";
import { assistantLayerPaths, defaultScopePolicy } from "./scope";
import { HomeView, HOME_VIEW } from "./home";

interface PluginData { settings: Settings; combat: Combat; encounterSets: EncounterSet[] }
export interface RunContext { run: TFile; campaign: TFile; party: TFile; state: TFile; day: TFile | null }

const STRINGS_OVERRIDE = "_local/plugins/table-tools/strings.json";
const SCOPE_PATHS = assistantLayerPaths("scope.json");
const SOURCE_KINDS: SourceKind[] = ["run", "state", "campaign", "party", "system", "homebrew", "house-rule", "note"];

export default class TableTools extends Plugin {
  settings: Settings = { ...DEFAULTS };
  combat: Combat = newCombat();
  encounterSets: EncounterSet[] = [];
  strings: Strings = { ...englishStrings };
  tracker = new CombatTracker(this);
  /** Open combat views, re-rendered after every combat change. */
  views = new Set<CombatView>();
  /** Open home views, refreshed after vault and active-run changes. */
  homeViews = new Set<HomeView>();
  index!: AssistantIndex;
  skills = new Map<string, Skill>();
  invalidSkillsKey = "";
  scopePolicy: ScopePolicy = { ...defaultScopePolicy, exclude: [...(defaultScopePolicy.exclude ?? [])], gm: [...defaultScopePolicy.gm], player: [...defaultScopePolicy.player] };
  private skillReloadTimer?: number;
  private homeRefreshTimer?: number;
  private homeRefreshPaths = new Set<string>();
  private homeRelevantPaths = new Set<string>();

  async onload(): Promise<void> {
    await this.loadStrings();
    await this.loadSettings();
    await this.loadScopePolicy();
    this.index = new AssistantIndex(this);
    this.index.start();
    this.app.vault.getMarkdownFiles().forEach(file => this.homeChangeAffects(file, file.path));
    const vaultEvents = this.app.vault as typeof this.app.vault & { on: (event: string, callback: (file: TFile) => void) => unknown };
    for (const event of ["create", "modify", "delete"]) this.registerEvent(vaultEvents.on(event, file => {
      if (file instanceof TFile && SCOPE_PATHS.includes(file.path)) void this.loadScopePolicy();
      if (file instanceof TFile && this.isSkillPath(file.path)) void this.reloadSkills();
      if (file instanceof TFile && this.homeChangeAffects(file, file.path)) this.scheduleHomeRefresh(file.path);
    }) as never);
    this.skills = await loadSkills(this);
    this.registerEvent(this.app.metadataCache.on("changed", file => {
      if (file instanceof TFile && this.isSkillPath(file.path)) void this.reloadSkills();
      if (file instanceof TFile && this.homeChangeAffects(file, file.path)) this.scheduleHomeRefresh(file.path);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && (this.isSkillPath(file.path) || this.isSkillPath(oldPath))) void this.reloadSkills();
      if (file instanceof TFile && (this.homeChangeAffects(file, file.path) || this.homeChangeAffects(undefined, oldPath))) {
        this.scheduleHomeRefresh(file.path, oldPath);
      }
    }));
    const s = this.strings;
    this.registerView(COMBAT_VIEW, leaf => new CombatView(leaf, this));
    this.registerView(ASSISTANT_VIEW, leaf => new AssistantView(leaf, this));
    this.registerView(HOME_VIEW, leaf => new HomeView(leaf, this));

    this.addRibbonIcon("home", s.ribbonHome, () => this.openHome());
    this.addRibbonIcon("swords", s.ribbonCombat, () => void this.openView(COMBAT_VIEW));
    this.addRibbonIcon("sparkles", s.ribbonAssistant, () => void this.openView(ASSISTANT_VIEW));

    this.addCommand({ id: "open-combat", name: s.commandOpenCombat, callback: () => void this.openView(COMBAT_VIEW) });
    this.addCommand({ id: "open-assistant", name: s.commandOpenAssistant, callback: () => void this.openView(ASSISTANT_VIEW) });
    this.addCommand({ id: "open-home", name: s.commandOpenHome, callback: () => this.openHome() });
    this.addCommand({ id: "assistant-rebuild-index", name: s.commandRebuildAssistantIndex, callback: () => void this.index.rebuild(true) });
    this.addCommand({ id: "combat-next-turn", name: s.commandNextTurn, callback: () => this.tracker.advance(1) });
    this.addCommand({ id: "combat-previous-turn", name: s.commandPreviousTurn, callback: () => this.tracker.advance(-1) });
    this.addCommand({ id: "combat-roll-initiative", name: s.commandRollInitiative, callback: () => this.tracker.rollInitiative(false) });
    this.addCommand({ id: "combat-clear", name: s.commandClearCombat, callback: () => this.tracker.clear() });
    this.addCommand({
      id: "assistant-ask-selection", name: s.commandAskSelection, editorCallback: async editor => {
        const selection = editor.getSelection();
        if (!selection) { new Notice(s.selectTextFirst); return; }
        await this.openView(ASSISTANT_VIEW);
        await this.assistant()?.send(selection);
      },
    });

    this.addSettingTab(new TableToolsSettingTab(this.app, this));
    const workspace = this.app.workspace as typeof this.app.workspace & { onLayoutReady?: (callback: () => void) => void };
    workspace.onLayoutReady?.(() => {
      if (this.settings.openHomeOnStartup && !this.app.workspace.getLeavesOfType(HOME_VIEW).length) void this.openHome();
    });
  }

  async onunload(): Promise<void> { await this.index?.dispose(); }

  private scheduleHomeRefresh(...paths: string[]): void {
    paths.forEach(path => this.homeRefreshPaths.add(path));
    if (this.homeRefreshTimer) return;
    this.homeRefreshTimer = setTimeout(() => {
      this.homeRefreshTimer = undefined;
      const changed = this.homeRefreshPaths;
      this.homeRefreshPaths = new Set<string>();
      for (const view of this.homeViews) {
        changed.forEach(path => view.invalidate(path));
        void view.render();
      }
    }, 200) as unknown as number;
  }

  private homeChangeAffects(file: TFile | undefined, path: string): boolean {
    const shipped = "_system/";
    if (path === this.settings.activePointerPath || path.startsWith("_local/systems/") || path.startsWith(`${shipped}systems/`)) return true;
    if (this.homeRelevantPaths.has(path)) return true;
    const type = file ? this.app.metadataCache.getFileCache(file)?.frontmatter?.type : undefined;
    const partyMembers = /^Parties\/[^/]+\/Party\.md$/.test(path);
    if (!["campaign", "run", "party", "world-day", "state"].includes(String(type)) && !partyMembers) return false;
    this.homeRelevantPaths.add(path);
    return true;
  }

  async loadStrings(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(STRINGS_OVERRIDE);
    if (!(file instanceof TFile)) return;
    try {
      this.strings = createStrings(JSON.parse(await this.app.vault.cachedRead(file)));
    } catch {
      this.strings = { ...englishStrings };
      new Notice(this.strings.stringsOverrideInvalid);
    }
  }

  async loadScopePolicy(): Promise<void> {
    for (const path of SCOPE_PATHS) {
      try {
        const value = JSON.parse(await this.app.vault.adapter.read(path)) as Partial<ScopePolicy>;
        if (value.version !== 1 || !this.validKinds(value.gm) || !this.validKinds(value.player)) throw new Error("invalid policy");
        if (value.exclude !== undefined && (!Array.isArray(value.exclude) || !value.exclude.every(prefix => typeof prefix === "string"))) throw new Error("invalid policy");
        this.scopePolicy = { version: 1, exclude: value.exclude, gm: value.gm, player: value.player };
        return;
      } catch {
        if (path.startsWith("_local") && await this.app.vault.adapter.exists(path)) new Notice(this.strings.assistantScopePolicyInvalid);
      }
    }
    this.scopePolicy = { ...defaultScopePolicy, exclude: [...(defaultScopePolicy.exclude ?? [])], gm: [...defaultScopePolicy.gm], player: [...defaultScopePolicy.player] };
  }

  private validKinds(value: unknown): value is SourceKind[] {
    return Array.isArray(value) && value.every(kind => SOURCE_KINDS.includes(kind as SourceKind));
  }

  private isSkillPath(path: string): boolean {
    if (assistantLayerPaths("skills").some(folder => path.startsWith(`${folder}/`))) return true;
    const scope = this.index?.scope();
    if (scope?.campaignFolder && path.startsWith(`${scope.campaignFolder}/Assistant/skills/`)) return true;
    return path === this.settings.activePointerPath || path === this.currentContext()?.run.path;
  }

  private reloadSkills(): void {
    if (this.skillReloadTimer) clearTimeout(this.skillReloadTimer);
    this.skillReloadTimer = setTimeout(() => {
      this.skillReloadTimer = undefined;
      void loadSkills(this).then(skills => { this.skills = skills; });
    }, 200) as unknown as number;
  }


  async loadSettings(): Promise<void> {
    const data = await this.loadData() as Partial<PluginData> | null;
    this.settings = { ...DEFAULTS, ...(data?.settings ?? {}) };
    this.combat = data?.combat ?? newCombat(this.strings.defaultCombatName);
    this.encounterSets = data?.encounterSets ?? [];
  }

  async save(): Promise<void> {
    await this.saveData({ settings: this.settings, combat: this.combat, encounterSets: this.encounterSets } satisfies PluginData);
  }

  async applyEmbeddingSettings(): Promise<void> {
    await this.index.applyEmbeddingSettings();
    await this.save();
  }

  refreshViews(): void {
    for (const view of this.views) view.render();
  }

  async openView(type: string): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(type)[0];
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /** Opens the overview in the main workspace area, reusing an existing home leaf. */
  async openHome(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(HOME_VIEW)[0];
    if (existing) { this.app.workspace.revealLeaf(existing); return; }
    const workspace = this.app.workspace as typeof this.app.workspace & { getLeaf?: (newLeaf?: boolean) => ReturnType<typeof this.app.workspace.getRightLeaf> };
    const leaf = workspace.getLeaf?.(true) ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: HOME_VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /** Changes the single active-run pointer while preserving the ADR-0002 pointer semantics. */
  async setActiveRun(runPath: string): Promise<void> {
    const target = runPath.replace(/\.md$/, "");
    let pointer = this.app.vault.getAbstractFileByPath(this.settings.activePointerPath);
    if (!(pointer instanceof TFile)) {
      pointer = await this.app.vault.create(this.settings.activePointerPath, `---\nrun: "[[${target}]]"\n---\n\n# Active Run\n`);
    } else await this.app.fileManager.processFrontMatter(pointer, fields => { fields.run = `[[${target}]]`; });
    this.reloadSkills();
    this.refreshViews();
    this.scheduleHomeRefresh(this.settings.activePointerPath);
  }

  /** Reads the display name for a system, preferring a vault-local package. */
  async systemName(id: string): Promise<string> {
    for (const root of ["_local/", "_system/"]) {
      try {
        const value = JSON.parse(await this.app.vault.adapter.read(`${root}systems/${id}/package.json`)) as { name?: unknown };
        if (typeof value.name === "string" && value.name) return value.name;
      } catch { /* Try the next layer. */ }
    }
    return id;
  }

  /** Lists installed system packages with local packages taking precedence. */
  async systemPackages(): Promise<{ id: string; name: string }[]> {
    const packages = new Map<string, string>();
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & { list?: (path: string) => Promise<{ folders: string[] }> };
    for (const root of ["_system/", "_local/"]) {
      try {
        const listed = await adapter.list?.(`${root}systems`);
        for (const folder of listed?.folders ?? []) {
          const id = folder.split("/").at(-1) ?? "";
          if (id) packages.set(id, await this.systemName(id));
        }
      } catch { /* A layer without a systems folder is optional. */ }
    }
    if (!packages.size) packages.set("generic", await this.systemName("generic"));
    return [...packages].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
  }

  assistant(): AssistantView | undefined {
    return this.app.workspace.getLeavesOfType(ASSISTANT_VIEW)[0]?.view as AssistantView | undefined;
  }

  private linkPath(value: unknown): string {
    return String(value ?? "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0];
  }

  private resolve(value: unknown, source: TFile): TFile | null {
    return this.app.metadataCache.getFirstLinkpathDest(this.linkPath(value), source.path);
  }

  /** Resolves the active run from the pointer note, then its campaign, party, state, and world day. */
  currentContext(): RunContext | null {
    const pointer = this.app.vault.getAbstractFileByPath(this.settings.activePointerPath);
    if (!(pointer instanceof TFile)) return null;
    const run = this.resolve(this.app.metadataCache.getFileCache(pointer)?.frontmatter?.run, pointer);
    if (!run) return null;
    const fields = this.app.metadataCache.getFileCache(run)?.frontmatter ?? {};
    const campaign = this.resolve(fields.campaign, run);
    const party = this.resolve(fields.party, run);
    const folder = run.parent?.path;
    if (!folder) return null;
    const state = this.app.vault.getAbstractFileByPath(`${folder}/State.md`);
    const day = this.app.vault.getAbstractFileByPath(`${folder}/World Day.md`);
    return campaign && party && state instanceof TFile ? { run, campaign, party, state, day: day instanceof TFile ? day : null } : null;
  }

  partyPath(): string {
    return this.settings.partyPath || this.currentContext()?.party.parent?.path || "";
  }

  /** The campaign system's shared bestiary plus the campaign's own homebrew bestiary. */
  bestiaryPaths(): string[] {
    if (this.settings.bestiaryPath) return [this.settings.bestiaryPath];
    const context = this.currentContext();
    const system = String(context ? this.app.metadataCache.getFileCache(context.campaign)?.frontmatter?.system ?? "generic" : "generic");
    return [`Library/Mechanics/${system}/Bestiary`, ...(context?.campaign.parent ? [`${context.campaign.parent.path}/Mechanics/Bestiary`] : [])];
  }
}

class TableToolsSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TableTools) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.strings;
    const settings = this.plugin.settings;
    const save = (): void => { void this.plugin.save(); };

    new Setting(containerEl).setName(s.settingsAssistantHeading).setHeading();
    new Setting(containerEl).setName(s.settingsApiKey).setDesc(s.settingsApiKeyDescription).addText(text => {
      text.inputEl.type = "password";
      text.setPlaceholder("AIza\u2026").setValue(settings.apiKey).onChange(value => { settings.apiKey = value.trim(); save(); });
    });
    const model = new Setting(containerEl).setName(s.settingsModel).setDesc(s.settingsModelDescription);
    const renderModel = (): void => {
      model.controlEl.empty();
      model.addDropdown(dropdown => {
        for (const name of settings.models) dropdown.addOption(name, name);
        if (!settings.models.includes(settings.model)) dropdown.addOption(settings.model, settings.model);
        dropdown.setValue(settings.model).onChange(value => { settings.model = value; save(); });
      });
      model.addButton(button => button.setButtonText(s.settingsFetchModels).onClick(async () => {
        if (!settings.apiKey) { new Notice(s.settingsNeedApiKey); return; }
        try {
          const models = await listModels(settings.apiKey, s);
          if (!models.length) { new Notice(s.settingsModelListEmpty); return; }
          settings.models = models;
          if (!models.includes(settings.model)) settings.model = models.find(name => /flash/.test(name) && !/lite/.test(name)) ?? models[0];
          save();
          renderModel();
          new Notice(format(s.settingsModelCount, { count: models.length }));
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        }
      }));
    };
    renderModel();
    new Setting(containerEl).setName(s.settingsTemperature).setDesc(s.settingsTemperatureDescription)
      .addSlider(slider => slider.setLimits(0, 1.5, 0.1).setValue(settings.temperature).setDynamicTooltip().onChange(value => { settings.temperature = value; save(); }));
    new Setting(containerEl).setName(s.settingsSystemPrompt).setDesc(s.settingsSystemPromptDescription).addTextArea(text => {
      text.inputEl.rows = 12;
      text.inputEl.style.width = "100%";
      text.setValue(settings.systemPrompt).onChange(value => { settings.systemPrompt = value; save(); });
    });
    new Setting(containerEl).setName(s.settingsContextLimit).setDesc(s.settingsContextLimitDescription)
      .addText(text => text.setValue(String(settings.maxContext)).onChange(value => { settings.maxContext = Number(value) || DEFAULTS.maxContext; save(); }));
    new Setting(containerEl).setName(s.settingsContextBudget).setDesc(s.settingsContextBudgetDescription)
      .addText(text => text.setValue(String(settings.contextBudgetTokens)).onChange(value => { settings.contextBudgetTokens = Number(value) || DEFAULTS.contextBudgetTokens; save(); }));
    new Setting(containerEl).setName(s.settingsToolSteps).setDesc(s.settingsToolStepsDescription)
      .addText(text => text.setValue(String(settings.maxToolSteps)).onChange(value => { settings.maxToolSteps = Number(value) || DEFAULTS.maxToolSteps; save(); }));
    new Setting(containerEl).setName(s.settingsEmbeddingProvider).setDesc(s.settingsEmbeddingProviderDescription).addDropdown(dropdown => {
      dropdown.addOption("none", "None").addOption("ollama", "Ollama").addOption("gemini", "Gemini");
      dropdown.setValue(settings.embeddingProvider).onChange(value => { settings.embeddingProvider = value as Settings["embeddingProvider"]; void this.plugin.applyEmbeddingSettings(); });
    });
    new Setting(containerEl).setName(s.settingsOllamaUrl).addText(text => text.setValue(settings.ollamaUrl).onChange(value => { settings.ollamaUrl = value.trim(); void this.plugin.applyEmbeddingSettings(); }));
    new Setting(containerEl).setName(s.settingsOllamaModel).addText(text => text.setValue(settings.ollamaModel).onChange(value => { settings.ollamaModel = value.trim(); void this.plugin.applyEmbeddingSettings(); }));
    new Setting(containerEl).setName(s.settingsGeminiEmbeddingModel).setDesc(s.settingsGeminiEmbeddingDescription).addText(text => text.setValue(settings.geminiEmbeddingModel).onChange(value => { settings.geminiEmbeddingModel = value.trim(); void this.plugin.applyEmbeddingSettings(); }));
    new Setting(containerEl).setName(s.settingsEmbeddingDimensions).addText(text => text.setValue(String(settings.embeddingDimensions)).onChange(value => { settings.embeddingDimensions = Number(value) || DEFAULTS.embeddingDimensions; void this.plugin.applyEmbeddingSettings(); }));
    new Setting(containerEl).setName(s.settingsEmbeddingTest).addButton(button => button.setButtonText(s.settingsEmbeddingTest).onClick(async () => {
      try {
        await this.plugin.applyEmbeddingSettings();
        const dimensions = await this.plugin.index.testEmbedding();
        new Notice(format(s.settingsEmbeddingTestSuccess, { dimensions: String(dimensions) }));
      } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
    }));
    const path = (name: string, key: "activePointerPath" | "campaignPath" | "worldDayPath" | "bestiaryPath" | "partyPath", description = ""): void => {
      const setting = new Setting(containerEl).setName(name);
      if (description) setting.setDesc(description);
      setting.addText(text => text.setValue(settings[key]).onChange(value => { settings[key] = value.trim(); save(); }));
    };
    path(s.settingsActivePointer, "activePointerPath");
    path(s.settingsCampaignOverride, "campaignPath", s.settingsUseCurrentRun);
    path(s.settingsWorldDayOverride, "worldDayPath", s.settingsUseCurrentRun);

    new Setting(containerEl).setName(s.settingsHomeHeading).setHeading();
    new Setting(containerEl).setName(s.settingsOpenHomeOnStartup).setDesc(s.settingsOpenHomeOnStartupDescription)
      .addToggle(toggle => toggle.setValue(settings.openHomeOnStartup).onChange(value => { settings.openHomeOnStartup = value; save(); }));

    new Setting(containerEl).setName(s.settingsCombatHeading).setHeading();
    path(s.settingsBestiaryOverride, "bestiaryPath", s.settingsBestiaryOverrideDescription);
    path(s.settingsPartyOverride, "partyPath", s.settingsUseCurrentRun);
    new Setting(containerEl).setName(s.settingsAverageHitPoints).setDesc(s.settingsAverageHitPointsDescription)
      .addToggle(toggle => toggle.setValue(settings.useAverageHitPoints).onChange(value => { settings.useAverageHitPoints = value; save(); }));
    new Setting(containerEl).setName(s.settingsGroupInitiative).setDesc(s.settingsGroupInitiativeDescription)
      .addToggle(toggle => toggle.setValue(settings.groupInitiative).onChange(value => { settings.groupInitiative = value; save(); }));
    new Setting(containerEl).setName(s.settingsAttackBonusPhrases).setDesc(s.settingsAttackBonusPhrasesDescription)
      .addText(text => text.setValue(settings.attackBonusPhrases).onChange(value => { settings.attackBonusPhrases = value; save(); }));
  }
}
