import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
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
