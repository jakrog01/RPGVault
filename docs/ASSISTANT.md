# Assistant retrieval

Table Tools Assistant is a GM-oriented chat view that combines a Gemini response with local vault context, local search, and read-only tools.
Open it from **Table Tools: Assistant**, **Open assistant**, a home-card action, or **Assistant: ask about the selected text**.
The selected-text command requires an editor selection; otherwise it says **Select some text first.**
Add a Google AI key in Table Tools settings before sending a question; without one the view says **Paste a Google AI key into the Table Tools settings to begin.**

## Scope and roles

The active run determines the role, campaign, party, system, and folders available to assistant search.
A run whose frontmatter role is `player` has player scope; every other value has GM scope.
GM scope includes run, state, campaign, party, active-system library, and campaign mechanics or homebrew.
Player scope includes run, state, party, and ordinary scoped notes, but not campaign, system, or homebrew roots.
Rule results are ordered house rule, campaign homebrew, then system library when they occupy retrieved positions.
Campaign-linked rules are restricted to that campaign; system rules require the active campaign system.

The assistant excludes `Archive/`, `_system/`, `_local/`, `.obsidian/`, and `.rpgvault/` from indexing and scope.
Notes with `assistant: exclude` frontmatter are also excluded.
The shipped scope policy is `_system/assistant/scope.json`; a local `_local/assistant/scope.json` policy overrides it when valid.
The policy shape is `{ "version": 1, "exclude": ["prefix/"], "gm": ["kind"], "player": ["kind"] }`, with optional `exclude` prefixes supplementing built-in exclusions.
The shipped GM kinds are `run`, `state`, `campaign`, `party`, `system`, `homebrew`, `house-rule`, and `note`; player kinds are `run`, `state`, `party`, and `note`.
Kinds omitted from the policy are excluded, and policy changes reload immediately.
An invalid local policy falls back to the shipped policy and shows a notice.

## What a request sends

The top toggles control **Run**, **Today**, **Note**, **Combat**, and **Search** context.
Run attaches the campaign, active run, and state notes; Today attaches the world-day note; Combat attaches a plain-English tracker summary.
Note attaches the active Markdown note, and the paperclip can attach specific vault notes for the conversation.
Search retrieves up to eight distinct scoped note paths after pinned context, within the retrieval-token budget.
Pinned campaign, run, state, world day, combat, attached notes, and active note are not repeated in retrieval.
The request also includes run role, campaign, system, party names, available skill names and descriptions, the selected quick-prompt skill when applicable, conversation history, and your question.
Retrieved chunks carry wikilink citations and are budgeted at approximately one token per four characters.
Large pinned notes retain frontmatter, headings, and an opening portion with an index pointer; context is capped by the configured character and token budgets.
With the default 24,000-character limit and 6,000-token retrieval budget, the character cap does not shorten budgeted context.
When you send, the configured Gemini model receives the assembled context, conversation, system prompt, question, and tool declarations.
Use the toggles and attachments to avoid sending irrelevant notes.

## Read-only tools

The model can request these tools; each runs against the active scope and returns data to the model, not a vault write.

| Tool | What it returns |
| --- | --- |
| `search_vault` | Scoped lexical search results with citations, snippets, and scores. |
| `read_note` | A scoped note or one matching heading, with cited content. |
| `find_by_name` | Matching NPC, location, creature, or item titles, aliases, and citations. |
| `list_notes` | Up to 100 scoped note paths, titles, and frontmatter filtered by type, status, or folder. |
| `lookup_rule` | Up to eight matching house-rule, homebrew, or system rule results in precedence order. |
| `get_run_state` | The current scope plus active run state and world-day text. |
| `get_combat_state` | The current combat summary. |
| `roll_dice` | The result of a dice expression. |
| `load_skill` | A named skill body, or an unknown-skill error. |

Tool traces are shown under **Tools used** in an assistant response.
The configured maximum tool steps limits tool rounds; reaching it adds **Tool step limit reached.**

## Skills and quick prompts

Skills are Markdown files with `name` and `description` frontmatter, optional `system` and `tools`, and an instruction body.
The six shipped skills are `consequences`, `npc-improvisation`, `passer-by`, `rules-adjudication`, `scene-description`, and `session-summary`.
Add shared local skills in `_local/assistant/skills/`; a same-named local skill overrides the shipped version.
GM-only campaign skills live at `<campaign>/Assistant/skills/` and are unavailable to player runs.
Later matching names override earlier ones; invalid files are skipped and reported together.
Skill changes, renames, deletions, and active-campaign changes reload the list automatically.
Free questions receive skill names and descriptions; the model uses `load_skill` to receive a full skill body.

Quick prompts are **Describe the scene**, **What does the NPC do?**, **Passer-by**, **Consequences**, **Summarise**, **Names**, and **Mechanics**.
Scene, NPC, passer-by, consequences, summary, and mechanics load their matching shipped skill on the first request.
Consequences and Mechanics place a partial prompt in the input for you to complete; the other shortcuts send immediately.
Use **New conversation** to clear conversation history and attachments.

## Responses and Sources

Assistant output renders as Markdown and offers copy, insert into the active editor, and regenerate actions.
Every model answer that has retrieved or tool-returned notes has a **Sources** disclosure listing their vault paths.
Select a source path to open that note in Obsidian.
Breadcrumb citations use the full heading path; headings inside fenced code blocks are not treated as headings.
The assistant may warn about blocked responses, an invalid key, unavailable model, access denial, rate limits, or another provider error.

## Local index and semantic search

The lexical index is always local and indexes visible Markdown using the scope rules above.
Its cache is `.rpgvault/cache/assistant/manifest.json`; vectors, when enabled, are `.rpgvault/cache/assistant/vectors.bin` Float32 data.
The view status reports indexing and indexed note and chunk counts.
Run **Assistant: rebuild index** to force a rebuild after substantial note or provider changes.

`none` is the default embedding provider and keeps retrieval local; it sends no note text to an embedding provider.
`ollama` sends batches of note chunks to the configured Ollama URL, which defaults to `http://127.0.0.1:11434`, using `embeddinggemma` by default.
`gemini` sends note text to Google for embeddings with `gemini-embedding-001` by default; choose it only when that privacy trade-off is acceptable.
Changing provider, model, URL, or dimensions discards stored vectors and queues new embeddings without rereading source notes.
Removed or re-chunked notes lose their vectors on the next cache write.

During an embedding outage, the plugin pauses embedding work and shows **Embeddings are unavailable; using local lexical search.** once for the outage.
Lexical retrieval continues to work.
A note-index change, provider settings apply, or a successful query embedding resumes pending embedding work; a later outage is reported again only after success.

## Related pages

Use [Table Tools settings](SETTINGS.md) to control model, context, tool, and embedding settings.
Use [Table Tools at the table](TABLE-TOOLS.md) for combat state that may be attached to a request.
Use [Customising Table Tools](CUSTOMISING.md) for localised strings and local plugin guidance.
