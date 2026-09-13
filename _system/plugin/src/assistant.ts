import { App, FuzzySuggestModal, ItemView, MarkdownRenderer, MarkdownView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type TableTools from "./main";
import { streamTurn } from "./gemini";
import { StringKey, Strings } from "./strings";
import { ChatMessage, Settings } from "./types";
import { declarations, VaultTools } from "./tools";
import { compareRuleHits } from "./indexer";

export const ASSISTANT_VIEW = "tt-assistant";

/** Quick prompts. A prompt ending with a blank line is placed in the input for the GM to complete. */
const QUICK_PROMPTS: { label: StringKey; prompt: StringKey; icon: string }[] = [
  { label: "quickSceneLabel", prompt: "quickScenePrompt", icon: "eye" },
  { label: "quickNpcLabel", prompt: "quickNpcPrompt", icon: "user" },
  { label: "quickPasserbyLabel", prompt: "quickPasserbyPrompt", icon: "footprints" },
  { label: "quickConsequencesLabel", prompt: "quickConsequencesPrompt", icon: "git-branch" },
  { label: "quickSummaryLabel", prompt: "quickSummaryPrompt", icon: "scroll" },
  { label: "quickNamesLabel", prompt: "quickNamesPrompt", icon: "tag" },
  { label: "quickMechanicsLabel", prompt: "quickMechanicsPrompt", icon: "dices" },
];

type ContextToggle = "includeCampaign" | "includeWorldDay" | "includeActiveNote" | "includeCombat" | "contextRetrieval";

export class AssistantView extends ItemView {
  history: ChatMessage[] = [];
  attachments: string[] = [];
  busy = false;
  controller?: AbortController;
  private listEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private attachmentsEl!: HTMLElement;
  private unsubscribeIndex?: () => void;

  constructor(leaf: WorkspaceLeaf, readonly plugin: TableTools) { super(leaf); }

  getViewType(): string { return ASSISTANT_VIEW; }
  getDisplayText(): string { return this.plugin.strings.assistantTitle; }
  getIcon(): string { return "sparkles"; }

  async onOpen(): Promise<void> {
    this.unsubscribeIndex = this.plugin.index.subscribe(() => this.renderIndexStatus());
    this.render();
  }

  async onClose(): Promise<void> { this.unsubscribeIndex?.(); }

  private get strings(): Strings { return this.plugin.strings; }

  render(): void {
    const s = this.strings;
    const settings = this.plugin.settings;
    const root = this.contentEl;
    root.empty();
    root.addClass("tt-assistant");

    const top = root.createDiv("tt-as-top");
    const model = top.createSpan({ cls: "tt-chip tt-chip-model", text: settings.model, attr: { title: s.modelChipTitle } });
    model.onclick = () => (this.app as App & { setting?: { open?: () => void } }).setting?.open?.();
    const toggles = top.createDiv("tt-as-context");
    const toggle = (label: string, key: ContextToggle, title: string): void => {
      const element = toggles.createEl("label", { cls: "tt-as-toggle" + (settings[key] ? " tt-on" : ""), attr: { title } });
      const checkbox = element.createEl("input", { type: "checkbox" });
      checkbox.checked = settings[key];
      element.createSpan({ text: label });
      checkbox.onchange = () => {
        settings[key] = checkbox.checked;
        element.toggleClass("tt-on", checkbox.checked);
        void this.plugin.save();
      };
    };
    toggle(s.contextRun, "includeCampaign", s.contextRunTitle);
    toggle(s.contextWorldDay, "includeWorldDay", s.contextWorldDayTitle);
    toggle(s.contextNote, "includeActiveNote", s.contextNoteTitle);
    toggle(s.contextCombat, "includeCombat", s.contextCombatTitle);
    toggle(s.contextRetrieval, "contextRetrieval", s.contextRetrievalTitle);
    const attach = toggles.createEl("button", { cls: "tt-btn-mini", attr: { title: s.attachNoteTitle, "aria-label": s.attachNoteTitle } });
    setIcon(attach, "paperclip");
    attach.onclick = () => new NotePickerModal(this.app, s, file => this.attach(file.path)).open();
    const fresh = top.createEl("button", { cls: "tt-btn-mini", attr: { title: s.newConversation, "aria-label": s.newConversation } });
    setIcon(fresh, "plus-square");
    fresh.onclick = () => this.newConversation();

    this.attachmentsEl = root.createDiv("tt-as-attachments");
    this.listEl = root.createDiv("tt-as-list");
    if (!this.history.length) {
      const welcome = this.listEl.createDiv("tt-as-welcome");
      welcome.createEl("p", { text: settings.apiKey ? s.assistantReady : s.assistantNeedsKey });
      welcome.createEl("p", { cls: "tt-muted", text: s.assistantContextHint });
    }
    for (const message of this.history) this.renderMessage(message);

    const quick = root.createDiv("tt-as-quick");
    for (const entry of QUICK_PROMPTS) {
      const prompt = s[entry.prompt];
      const button = quick.createEl("button", { cls: "tt-as-quick-button", attr: { title: prompt } });
      setIcon(button.createSpan(), entry.icon);
      button.createSpan({ text: s[entry.label] });
      button.onclick = () => {
        if (prompt.endsWith("\n\n")) { this.inputEl.value = prompt; this.inputEl.focus(); }
        else void this.send(prompt);
      };
    }

    const bottom = root.createDiv("tt-as-bottom");
    this.inputEl = bottom.createEl("textarea", { cls: "tt-as-input", attr: { placeholder: s.inputPlaceholder, rows: "3" } });
    this.inputEl.onkeydown = event => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void this.send(this.inputEl.value); }
    };
    const sendButton = bottom.createEl("button", { cls: "tt-btn tt-btn-primary tt-as-send", attr: { "aria-label": s.send, title: s.send } });
    setIcon(sendButton, "send");
    sendButton.onclick = () => void this.send(this.inputEl.value);
    this.statusEl = root.createDiv("tt-as-status");
    this.renderIndexStatus();
    this.renderAttachments();
  }

  private renderIndexStatus(): void {
    if (!this.statusEl || this.busy) return;
    this.statusEl.empty();
    this.statusEl.createSpan({ text: this.plugin.index.status() });
  }


  attach(path: string): void {
    if (!this.attachments.includes(path)) this.attachments.push(path);
    this.renderAttachments();
  }

  newConversation(): void {
    this.history = [];
    this.attachments = [];
    this.render();
  }

  renderAttachments(): void {
    const element = this.attachmentsEl;
    if (!element) return;
    element.empty();
    for (const path of this.attachments) {
      const chip = element.createSpan({ cls: "tt-chip tt-chip-attachment", text: (path.split("/").pop() ?? path).replace(/\.md$/, "") });
      const remove = chip.createSpan({ cls: "tt-chip-remove", text: " \u00d7", attr: { title: this.strings.removeAttachment } });
      remove.onclick = () => { this.attachments = this.attachments.filter(entry => entry !== path); this.renderAttachments(); };
    }
  }

  renderMessage(message: ChatMessage): HTMLElement {
    const s = this.strings;
    const element = this.listEl.createDiv("tt-as-message tt-as-" + message.role);
    const content = element.createDiv("tt-as-content");
    if (message.role === "user") content.setText(message.text);
    else void MarkdownRenderer.render(this.app, message.text, content, "", this);
    if (message.role === "model") {
      if (message.toolTrace?.length) {
        const trace = element.createEl("details", { cls: "tt-as-tool-trace" });
        trace.createEl("summary", { text: s.assistantToolTrace });
        for (const entry of message.toolTrace) trace.createEl("div", { text: `${entry.name}: ${entry.summary}` });
      }
      const actions = element.createDiv("tt-as-actions");
      const action = (icon: string, title: string, onClick: () => void): void => {
        const button = actions.createEl("button", { cls: "tt-btn-mini", attr: { title, "aria-label": title } });
        setIcon(button, icon);
        button.onclick = onClick;
      };
      action("clipboard-copy", s.copy, async () => { await navigator.clipboard?.writeText?.(message.text); new Notice(s.copied); });
      action("file-input", s.insertIntoNote, () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) { new Notice(s.openNoteInEditor); return; }
        view.editor.replaceSelection(message.text + "\n");
        new Notice(s.inserted);
      });
      action("refresh-cw", s.regenerate, () => {
        const index = this.history.indexOf(message);
        if (index <= 0) return;
        const question = this.history[index - 1];
        this.history.splice(index - 1);
        this.render();
        void this.send(question.text);
      });
    }
    return element;
  }

  async buildContext(question = "", previousQuestion = ""): Promise<string> {
    const settings: Settings = this.plugin.settings;
    const parts: string[] = [];
    const read = async (path: string): Promise<string> => {
      if (!path) return "";
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? this.app.vault.cachedRead(file) : "";
    };
    const run = this.plugin.currentContext();
    const cap = (text: string, limit: number, path: string): string => {
      if (Math.ceil(text.length / 4) <= limit) return text;
      const body = text.replace(/^---[\s\S]*?---\s*/, "");
      const outline = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => `# ${match[1]}`).join("\n");
      return `${text.match(/^---[\s\S]*?---\s*/)?.[0] ?? ""}${outline}\n\n${body.slice(0, limit * 4)}\n\n[more in the index: ${path}]`;
    };
    if (settings.includeCampaign) {
      const campaign = await read(settings.campaignPath || run?.campaign.path || "");
      const runNote = run ? await read(run.run.path) : "";
      const state = run ? await read(run.state.path) : "";
      if (campaign || runNote || state) parts.push(`## Run context\n${cap(campaign, 750, run?.campaign.path ?? "")}\n\n${cap(runNote, 375, run?.run.path ?? "")}\n\n${cap(state, 375, run?.state.path ?? "")}`);
    }
    if (settings.includeWorldDay) {
      const day = await read(settings.worldDayPath || run?.day?.path || "");
      if (day) parts.push(`## World day\n${cap(day.replace(/^---[\s\S]*?---\s*/, ""), 500, run?.day?.path ?? "")}`);
    }
    if (settings.includeCombat) {
      const combat = this.plugin.tracker.summary();
      if (combat) parts.push(`## Combat state\n${combat}`);
    }
    for (const path of this.attachments) {
      const text = await read(path);
      if (text) parts.push(`## Note: ${path}\n${cap(text, 1500, path)}`);
    }
    if (settings.includeActiveNote) {
      const file = this.app.workspace.getActiveFile();
      if (file && file.extension === "md" && !this.attachments.includes(file.path)) parts.push(`## Active note: ${file.path}\n${cap(await this.app.vault.cachedRead(file), 1500, file.path)}`);
    }
    if (question && this.plugin.index) {
      const scope = this.plugin.index.scope();
      const party = this.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(`${scope.partyFolder}/`)).map(file => file.basename).slice(0, 12).join(", ");
      parts.push(`## Scope\nRun: ${run?.run.basename ?? "none"} | role: ${scope.role} | campaign: ${run?.campaign.basename ?? "none"} | system: ${scope.system} | party: ${party}`);
      parts.push(`## Available skills\n${[...this.plugin.skills.values()].filter(skill => !skill.system || skill.system === scope.system).map(skill => `- ${skill.name}: ${skill.description}`).join("\n")}`);
      if (settings.contextRetrieval) {
        const pinned = new Set(this.attachments);
        if (settings.includeActiveNote) { const active = this.app.workspace.getActiveFile(); if (active) pinned.add(active.path); }
        const hits = this.plugin.index.search(`${previousQuestion} ${question}`, scope, 50).filter(hit => !pinned.has(hit.chunk.path));
        const rules = hits.filter(hit => ["house-rule", "homebrew", "system"].includes(hit.chunk.kind)).sort(compareRuleHits);
        const retrieved = [...rules, ...hits.filter(hit => !["house-rule", "homebrew", "system"].includes(hit.chunk.kind))];
        const selected: string[] = []; let used = Math.ceil(parts.join("\n").length / 4);
        for (const hit of retrieved) {
          const item = `[[${hit.chunk.path}#${hit.chunk.breadcrumb}]]\n${hit.chunk.text}`;
          if (selected.length >= 8 || used + Math.ceil(item.length / 4) > settings.contextBudgetTokens) break;
          selected.push(item); used += Math.ceil(item.length / 4);
        }
        if (selected.length) parts.push(`## Retrieved\nRule precedence: house rule > campaign homebrew > system library.\n\n${selected.join("\n\n")}`);
      }
    }
    let context = parts.join("\n\n");
    if (context.length > settings.maxContext) context = context.slice(0, settings.maxContext) + "\n\n[context truncated]";
    return context;
  }

  async send(raw: string): Promise<void> {
    const s = this.strings;
    const text = raw.trim();
    if (!text || this.busy) return;
    const settings = this.plugin.settings;
    if (!settings.apiKey) { new Notice(s.noApiKey); return; }
    this.inputEl.value = "";
    const previous = [...this.history].reverse().find(message => message.role === "user")?.text ?? "";
    const context = await this.buildContext(text, previous);
    const question: ChatMessage = { role: "user", text, time: Date.now() };
    this.history.push(question);
    this.listEl.querySelector(".tt-as-welcome")?.remove();
    this.renderMessage(question);
    const answer: ChatMessage = { role: "model", text: "", time: Date.now() };
    const pending = this.listEl.createDiv("tt-as-message tt-as-model tt-as-writing");
    const content = pending.createDiv("tt-as-content");
    content.setText("\u2026");
    this.listEl.scrollTop = this.listEl.scrollHeight;
    this.busy = true;
    const controller = new AbortController();
    this.controller = controller;
    this.statusEl.empty();
    this.statusEl.createSpan({ text: s.writing });
    const stop = this.statusEl.createEl("button", { cls: "tt-btn-mini tt-as-stop", text: s.stop });
    stop.onclick = () => controller.abort();
    // The model receives the history plus the context injected into the latest question.
    const messages = this.history.slice(0, -1).map(message => ({ ...message }));
    messages.push({ role: "user", text: context ? `<context>\n${context}\n</context>\n\nGM question: ${text}` : text, time: question.time });
    let buffer = "", lastRender = 0;
    try {
      const system = settings.systemPrompt;
      const tools = new VaultTools(this.plugin, this.plugin.index, () => this.plugin.skills);
      for (let step = 0; step < settings.maxToolSteps; step++) {
        const turn = await streamTurn({ apiKey: settings.apiKey, model: settings.model, temperature: settings.temperature, system, tools: declarations }, messages, s, fragment => {
          buffer += fragment; answer.text = buffer;
          const now = Date.now(); if (now - lastRender > 120) { lastRender = now; content.empty(); void MarkdownRenderer.render(this.app, buffer, content, "", this); this.listEl.scrollTop = this.listEl.scrollHeight; }
        }, controller.signal);
        messages.push({ role: "model", text: turn.text, time: Date.now(), parts: turn.parts });
        if (!turn.calls.length) break;
        const results = await Promise.all(turn.calls.map(call => tools.run(call)));
        answer.toolTrace ??= [];
        for (let index = 0; index < results.length; index++) answer.toolTrace.push({ name: results[index].name, args: turn.calls[index].args, summary: JSON.stringify(results[index].result).slice(0, 240) });
        messages.push({ role: "user", text: "", time: Date.now(), parts: results.map(result => ({ functionResponse: { name: result.name, response: result.result, ...(result.id ? { id: result.id } : {}) } })) });
        if (step === settings.maxToolSteps - 1) { buffer += `\n\n*${s.assistantToolLimit}*`; answer.text = buffer; }
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") answer.text = `${buffer}\n\n*${s.stopped}*`;
      else answer.text = `${buffer}\n\n> [!warning] ${error instanceof Error ? error.message : String(error)}`;
    }
    this.busy = false;
    this.controller = undefined;
    this.statusEl.empty();
    this.history.push(answer);
    pending.remove();
    this.renderMessage(answer);
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }
}

class NotePickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, strings: Strings, private readonly onPick: (file: TFile) => void) {
    super(app);
    this.setPlaceholder(strings.attachNotePlaceholder);
  }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles().filter(file => file.path.split("/")[0] !== "_system"); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.onPick(file); }
}
