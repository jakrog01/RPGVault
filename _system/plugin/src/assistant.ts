import { FuzzySuggestModal, ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type TableTools from "./main";
import { streamResponse } from "./gemini";
import { ChatMessage } from "./types";
import { combatContext } from "./combat";

export const ASSISTANT_VIEW = "tt-assistant";
const prompts = ["Describe the current scene using three senses in four sentences or fewer.", "Give three immediate choices for a non-player character in the active note.", "Summarize the active note for players and list open threads."];

export class AssistantView extends ItemView {
  messages: ChatMessage[] = [];
  attachments: string[] = [];
  controller?: AbortController;
  private list!: HTMLElement;
  constructor(leaf: WorkspaceLeaf, readonly plugin: TableTools) { super(leaf); }
  getViewType(): string { return ASSISTANT_VIEW; }
  getDisplayText(): string { return this.plugin.strings.assistant; }
  getIcon(): string { return "sparkles"; }
  async onOpen(): Promise<void> { this.render(); }
  render(): void {
    const root = this.contentEl; root.empty(); root.addClass("tt-assistant");
    const controls = root.createDiv("tt-as-controls");
    for (const [label, key] of [[this.plugin.strings.campaignContext, "includeCampaign"], [this.plugin.strings.dayContext, "includeWorldDay"], [this.plugin.strings.noteContext, "includeActiveNote"], [this.plugin.strings.combatContext, "includeCombat"]] as const) { const field = controls.createEl("label", { text: label }); const input = field.createEl("input", { type: "checkbox" }); input.checked = this.plugin.settings[key]; input.onchange = () => { this.plugin.settings[key] = input.checked; void this.plugin.save(); }; }
    const attach = controls.createEl("button", { text: this.plugin.strings.attachNote }); attach.onclick = () => new NotePicker(this.app, file => { if (!this.attachments.includes(file.path)) this.attachments.push(file.path); }).open();
    const reset = controls.createEl("button", { text: this.plugin.strings.newConversation }); reset.onclick = () => { this.messages = []; this.attachments = []; this.render(); };
    const stop = controls.createEl("button", { text: this.plugin.strings.stop }); stop.onclick = () => this.controller?.abort();
    this.list = root.createDiv("tt-as-list");
    if (!this.messages.length) this.list.createEl("p", { text: this.plugin.settings.apiKey ? this.plugin.strings.ready : this.plugin.strings.addKey });
    for (const message of this.messages) this.renderMessage(message);
    const quick = root.createDiv("tt-as-quick"); for (const prompt of prompts) { const button = quick.createEl("button", { text: prompt.split(".")[0] }); button.onclick = () => void this.send(prompt); }
    const input = root.createEl("textarea", { attr: { placeholder: this.plugin.strings.message } });
    const send = root.createEl("button", { text: this.plugin.strings.send }); send.onclick = () => void this.send(input.value);
  }
  private renderMessage(message: ChatMessage): void { const element = this.list.createDiv({ cls: `tt-message tt-${message.role}` }); void MarkdownRenderer.render(this.app, message.text, element, "", this.plugin); }
  async send(text: string): Promise<void> {
    if (!text.trim()) return;
    const message = { role: "user" as const, text: text.trim(), time: Date.now() }; this.messages.push(message); this.renderMessage(message);
    const response = { role: "model" as const, text: "", time: Date.now() }; this.messages.push(response); const element = this.list.createDiv({ cls: "tt-message tt-model" }); this.controller = new AbortController();
    try { await streamResponse({ apiKey: this.plugin.settings.apiKey, model: this.plugin.settings.model, temperature: this.plugin.settings.temperature, system: `${this.plugin.settings.systemPrompt}\n\n${await this.context()}` }, this.messages.slice(0, -1), fragment => { response.text += fragment; element.setText(response.text); }, this.controller.signal); } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
  }
  private async context(): Promise<string> {
    const sections: string[] = [];
    const addFile = async (label: string, file: TFile | null): Promise<void> => { if (file) sections.push(`## ${label}: ${file.path}\n${await this.app.vault.cachedRead(file)}`); };
    const context = this.plugin.currentContext();
    if (this.plugin.settings.includeCampaign) { await addFile("Campaign", context?.campaign ?? null); await addFile("Run", context?.run ?? null); await addFile("State", context?.state ?? null); }
    if (this.plugin.settings.includeWorldDay) await addFile("World day", context?.day ?? null);
    if (this.plugin.settings.includeActiveNote) await addFile("Active note", this.app.workspace.getActiveFile());
    if (this.plugin.settings.includeCombat) sections.push(combatContext(this.plugin.combat));
    for (const attachment of this.attachments) { const item = this.app.vault.getAbstractFileByPath(attachment); await addFile("Attachment", item instanceof TFile ? item : null); }
    return sections.join("\n\n").slice(0, this.plugin.settings.maxContext);
  }
}

class NotePicker extends FuzzySuggestModal<TFile> {
  constructor(app: import("obsidian").App, readonly selectFile: (file: TFile) => void) { super(app); }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.selectFile(file); }
}
