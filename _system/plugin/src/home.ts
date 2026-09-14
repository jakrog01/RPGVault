import { ItemView, Modal, Notice, Setting, TFile, WorkspaceLeaf } from "obsidian";
import type TableTools from "./main";

export const HOME_VIEW = "tt-home";

interface NoteSummary {
  file: TFile;
  fields: Record<string, unknown>;
}

const folderName = (file: TFile): string => file.parent?.path.split("/").at(-1) ?? file.basename;

const linkPath = (value: unknown): string => String(value ?? "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0];

/** The main-area overview of the active table and all campaign material. */
export class HomeView extends ItemView {
  private readonly memberCounts = new Map<string, Promise<number>>();
  private readonly dayLines = new Map<string, Promise<string>>();
  constructor(leaf: WorkspaceLeaf, readonly plugin: TableTools) { super(leaf); }

  getViewType(): string { return HOME_VIEW; }
  getDisplayText(): string { return this.plugin.strings.homeTitle; }
  getIcon(): string { return "home"; }

  async onOpen(): Promise<void> {
    this.plugin.homeViews.add(this);
    await this.render();
  }

  async onClose(): Promise<void> { this.plugin.homeViews.delete(this); }

  invalidate(path: string): void {
    this.memberCounts.delete(path);
    this.dayLines.delete(path);
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    const s = this.plugin.strings;
    root.empty();
    root.addClass("tt-home");
    root.createEl("h2", { text: s.homeTitle });
    const create = root.createDiv("tt-home-actions");
    this.button(create, s.homeNewCampaign, () => new CampaignModal(this.app, this.plugin, this).open());
    this.button(create, s.homeNewParty, () => new PartyModal(this.app, this.plugin, this).open());
    this.button(create, s.homeNewRun, () => new RunModal(this.app, this.plugin, this).open());

    const notes = this.notes();
    const campaigns = notes.filter(note => note.fields.type === "campaign");
    const runs = notes.filter(note => note.fields.type === "run");
    const parties = notes.filter(note => note.fields.type === "party");
    const context = this.plugin.currentContext();
    const worldDay = context?.day ? this.dayLine(context.day) : Promise.resolve("");
    const members = new Map(parties.map(party => [party.file.path, this.memberCountFor(party.file)]));

    if (context) await this.renderActive(root, context, await worldDay);
    if (!campaigns.length && !runs.length && !parties.length) root.createDiv({ cls: "tt-empty", text: s.homeEmpty });

    const campaignSection = root.createDiv("tt-home-section");
    campaignSection.createEl("h3", { text: s.homeCampaigns });
    for (const campaign of campaigns) await this.renderCampaign(campaignSection, campaign, runs);

    const assigned = new Set<string>();
    for (const campaign of campaigns) {
      const group = runs.filter(run => this.resolvesTo(run.fields.campaign, run.file, campaign.file));
      group.forEach(run => assigned.add(run.file.path));
      if (group.length) this.renderRuns(campaignSection, group, context?.run.path ?? "");
    }
    const loose = runs.filter(run => !assigned.has(run.file.path));
    if (loose.length) {
      const group = root.createDiv("tt-home-section");
      group.createEl("h3", { text: s.homeUnassignedRuns });
      this.renderRuns(group, loose, context?.run.path ?? "");
    }

    const partySection = root.createDiv("tt-home-section");
    partySection.createEl("h3", { text: s.homeParties });
    for (const party of parties) await this.renderParty(partySection, party, await (members.get(party.file.path) ?? Promise.resolve(0)));
  }

  private notes(): NoteSummary[] {
    return this.app.vault.getMarkdownFiles().map(file => ({
      file,
      fields: this.app.metadataCache.getFileCache(file)?.frontmatter ?? {},
    }));
  }

  private resolvesTo(value: unknown, source: TFile, target: TFile): boolean {
    return this.app.metadataCache.getFirstLinkpathDest(linkPath(value), source.path)?.path === target.path;
  }

  private role(value: unknown): string {
    return value === "player" ? this.plugin.strings.homeRolePlayer : this.plugin.strings.homeRoleGm;
  }

  private button(parent: HTMLElement, label: string, action: () => void): void {
    const button = parent.createEl("button", { cls: "tt-btn", text: label, attr: { "aria-label": label } });
    button.onclick = action;
  }

  private open(path: string): void { void this.app.workspace.openLinkText(path, ""); }

  private async systemName(id: unknown): Promise<string> { return this.plugin.systemName(String(id || "generic")); }

  private async renderActive(root: HTMLElement, context: NonNullable<ReturnType<TableTools["currentContext"]>>, day: string): Promise<void> {
    const s = this.plugin.strings;
    const card = root.createDiv("tt-home-active");
    card.createEl("h3", { text: s.homeActiveRun });
    card.createDiv({ cls: "tt-home-name", text: folderName(context.run) });
    card.createDiv({ cls: "tt-home-role", text: this.role(this.app.metadataCache.getFileCache(context.run)?.frontmatter?.role) });
    card.createDiv({ text: folderName(context.campaign) });
    card.createDiv({ cls: "tt-muted", text: await this.systemName(this.app.metadataCache.getFileCache(context.campaign)?.frontmatter?.system) });
    card.createDiv({ text: folderName(context.party) });
    if (day) card.createDiv({ cls: "tt-home-day", text: day });
    const actions = card.createDiv("tt-home-actions");
    this.button(actions, s.homeOpenRun, () => this.open(context.run.path));
    this.button(actions, s.homeOpenCampaign, () => this.open(context.campaign.path));
    this.button(actions, s.homeOpenParty, () => this.open(context.party.path));
    this.button(actions, s.homeOpenAssistant, () => void this.plugin.openView("tt-assistant"));
    this.button(actions, s.homeOpenCombat, () => void this.plugin.openView("tt-combat"));
  }

  private async firstDayLine(file: TFile): Promise<string> {
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n").map(line => line.trim());
    const body = lines[0] === "---" ? lines.slice((lines.indexOf("---", 1) + 1) || lines.length) : lines;
    return body.find(line => line && !line.startsWith("#")) ?? "";
  }

  private dayLine(file: TFile): Promise<string> {
    const cached = this.dayLines.get(file.path);
    if (cached) return cached;
    const result = this.firstDayLine(file);
    this.dayLines.set(file.path, result);
    return result;
  }

  private async renderCampaign(parent: HTMLElement, campaign: NoteSummary, runs: NoteSummary[]): Promise<void> {
    const s = this.plugin.strings;
    const card = parent.createDiv({ cls: "tt-home-campaign", attr: { "data-path": campaign.file.path } });
    card.createDiv({ cls: "tt-home-name", text: folderName(campaign.file) });
    card.createDiv({ cls: "tt-muted", text: await this.systemName(campaign.fields.system) });
    const count = runs.filter(run => this.resolvesTo(run.fields.campaign, run.file, campaign.file)).length;
    card.createDiv({ cls: "tt-muted", text: `${count} ${s.homeRuns}` });
    this.button(card, s.homeOpenCampaign, () => this.open(campaign.file.path));
  }

  private renderRuns(parent: HTMLElement, runs: NoteSummary[], activePath: string): void {
    for (const run of runs) {
      const card = parent.createDiv({ cls: "tt-home-run" + (run.file.path === activePath ? " tt-active" : ""), attr: { "data-path": run.file.path } });
      card.createDiv({ cls: "tt-home-name", text: folderName(run.file) });
      card.createDiv({ cls: "tt-home-role", text: this.role(run.fields.role) });
      const party = this.app.metadataCache.getFirstLinkpathDest(linkPath(run.fields.party), run.file.path);
      if (party) card.createDiv({ cls: "tt-muted", text: folderName(party) });
      this.button(card, this.plugin.strings.homeMakeActive, () => void this.plugin.setActiveRun(run.file.path));
    }
  }

  private async renderParty(parent: HTMLElement, party: NoteSummary, members: number): Promise<void> {
    const s = this.plugin.strings;
    const card = parent.createDiv({ cls: "tt-home-party", attr: { "data-path": party.file.path } });
    card.createDiv({ cls: "tt-home-name", text: folderName(party.file) });
    card.createDiv({ cls: "tt-muted", text: String(members) });
    this.button(card, s.homeOpenParty, () => this.open(party.file.path));
  }

  private async memberCount(file: TFile): Promise<number> {
    const content = await this.app.vault.cachedRead(file);
    const members = content.match(/^## Members\s*$([\s\S]*?)(?=^##\s|$)/m)?.[1] ?? "";
    return members.split("\n").filter(line => /^\s*[-*+]\s+\S/.test(line)).length;
  }

  private memberCountFor(file: TFile): Promise<number> {
    const cached = this.memberCounts.get(file.path);
    if (cached) return cached;
    const result = this.memberCount(file);
    this.memberCounts.set(file.path, result);
    return result;
  }
}

abstract class HomeCreateModal extends Modal {
  protected name = "";

  constructor(app: HomeView["app"], protected readonly plugin: TableTools, protected readonly view: HomeView) { super(app); }

  protected nameField(): void {
    new Setting(this.contentEl).setName(this.plugin.strings.homeFieldName).addText(text => {
      text.setValue(this.name).onChange(value => { this.name = value; });
    });
  }

  protected submit(action: () => Promise<void>): void {
    new Setting(this.contentEl).addButton(button => button.setButtonText(this.plugin.strings.homeCreate).setCta().onClick(() => void action()));
  }

  protected validName(): string | null {
    const name = this.name.trim();
    if (!name || /[\\/:*?"<>|#^\[\]]/.test(name)) {
      new Notice(this.plugin.strings.homeInvalidName);
      return null;
    }
    return name;
  }

  protected folderAvailable(folder: string): boolean {
    if (this.app.vault.getAbstractFileByPath(folder)) return false;
    return !this.app.vault.getMarkdownFiles().some(file => file.path.startsWith(`${folder}/`));
  }

  protected async createFolder(folder: string): Promise<void> {
    const vault = this.app.vault as typeof this.app.vault & { createFolder?: (path: string) => Promise<void> };
    await vault.createFolder?.(folder);
  }

  protected async createFromTemplate(kind: "campaign" | "party" | "run", folder: string, fileName: string, values: Record<string, string>): Promise<TFile> {
    const content = this.mergeTemplate(await this.template(kind), folder, values);
    await this.createFolder(folder);
    return this.app.vault.create(`${folder}/${fileName}`, content);
  }

  private async template(kind: "campaign" | "party" | "run"): Promise<string> {
    for (const root of ["_local/", "_system/"]) {
      try { return await this.app.vault.adapter.read(`${root}templates/${kind}.md`); } catch { /* Try the shipped template. */ }
    }
    return "";
  }

  private mergeTemplate(template: string, folder: string, values: Record<string, string>): string {
    const rendered = template.replace(/<%\s*tp\.file\.title\s*%>/g, this.name.trim())
      .replace(/<%\s*tp\.file\.folder\(true\)\s*%>/g, folder).replace(/<%[\s\S]*?%>/g, "");
    const match = rendered.match(/^---\n([\s\S]*?)\n---\n?/);
    const fields = new Map<string, string>();
    if (match) for (const line of match[1].split("\n")) {
      const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (pair) fields.set(pair[1], pair[2]);
    }
    Object.entries(values).forEach(([key, value]) => fields.set(key, value));
    const frontmatter = [...fields].map(([key, value]) => `${key}: ${value}`).join("\n");
    const body = match ? rendered.slice(match[0].length) : rendered;
    return `---\n${frontmatter}\n---\n\n${body}`;
  }

  protected async complete(file: TFile): Promise<void> {
    this.close();
    await this.app.workspace.openLinkText(file.path, "");
    await this.view.render();
  }
}

class CampaignModal extends HomeCreateModal {
  private system = "generic";

  async onOpen(): Promise<void> {
    this.contentEl.createEl("h3", { text: this.plugin.strings.homeNewCampaign });
    this.nameField();
    const systems = await this.plugin.systemPackages();
    if (!systems.some(system => system.id === this.system)) this.system = systems[0]?.id ?? "generic";
    new Setting(this.contentEl).setName(this.plugin.strings.homeFieldSystem).addDropdown(dropdown => {
      systems.forEach(system => dropdown.addOption(system.id, system.name));
      dropdown.setValue(this.system).onChange(value => { this.system = value; });
    });
    this.submit(() => this.create());
  }

  private async create(): Promise<void> {
    const name = this.validName();
    if (!name) return;
    const folder = `Campaigns/${name}`;
    if (!this.folderAvailable(folder)) { new Notice(this.plugin.strings.homeExists); return; }
    const file = await this.createFromTemplate("campaign", folder, "Campaign.md", { type: "campaign", system: this.system });
    await this.complete(file);
  }
}

class PartyModal extends HomeCreateModal {
  onOpen(): void {
    this.contentEl.createEl("h3", { text: this.plugin.strings.homeNewParty });
    this.nameField();
    this.submit(() => this.create());
  }

  private async create(): Promise<void> {
    const name = this.validName();
    if (!name) return;
    const folder = `Parties/${name}`;
    if (!this.folderAvailable(folder)) { new Notice(this.plugin.strings.homeExists); return; }
    const file = await this.createFromTemplate("party", folder, "Party.md", { type: "party" });
    await this.complete(file);
  }
}

class RunModal extends HomeCreateModal {
  private role = "gm";
  private campaign = "";
  private party = "";
  private makeActive = true;

  onOpen(): void {
    const s = this.plugin.strings;
    this.contentEl.createEl("h3", { text: s.homeNewRun });
    this.nameField();
    new Setting(this.contentEl).setName(s.homeFieldRole).addDropdown(dropdown => {
      dropdown.addOption("gm", s.homeRoleGm).addOption("player", s.homeRolePlayer);
      dropdown.setValue(this.role).onChange(value => { this.role = value; });
    });
    this.noteDropdown(s.homeFieldCampaign, "campaign", value => { this.campaign = value; });
    this.noteDropdown(s.homeFieldParty, "party", value => { this.party = value; });
    new Setting(this.contentEl).setName(s.homeFieldMakeActive).addToggle(toggle => {
      toggle.setValue(this.makeActive).onChange(value => { this.makeActive = value; });
    });
    this.submit(() => this.create());
  }

  private noteDropdown(label: string, type: string, change: (value: string) => void): void {
    new Setting(this.contentEl).setName(label).addDropdown(dropdown => {
      dropdown.addOption("", "");
      this.app.vault.getMarkdownFiles().filter(file => this.app.metadataCache.getFileCache(file)?.frontmatter?.type === type)
        .forEach(file => dropdown.addOption(file.path, folderName(file)));
      dropdown.setValue("").onChange(change);
    });
  }

  private async create(): Promise<void> {
    const name = this.validName();
    if (!name) return;
    if (!this.campaign || !this.party) { new Notice(this.plugin.strings.homeRunNeedsCampaignParty); return; }
    const folder = `Runs/${name}`;
    if (!this.folderAvailable(folder)) { new Notice(this.plugin.strings.homeExists); return; }
    const campaign = linkPath(this.campaign);
    const party = linkPath(this.party);
    const run = await this.createFromTemplate("run", folder, "Run.md", {
      type: "run",
      role: this.role,
      campaign: `"[[${campaign.replace(/\.md$/, "")}]]"`,
      party: `"[[${party.replace(/\.md$/, "")}]]"`,
    });
    await this.app.vault.create(`${folder}/State.md`, `---\ntype: state\nrun: "[[${folder}/Run]]"\n---\n\n# State\n\n## What players know\n`);
    await this.app.vault.create(`${folder}/World Day.md`, "---\ntype: world-day\n---\n\n# World Day\n");
    if (this.makeActive) await this.plugin.setActiveRun(run.path);
    await this.complete(run);
  }
}
