# Table Tools settings

Open Obsidian settings, choose **Table Tools**, and edit the three sections below.
Values are stored in the Table Tools plugin `data.json` as the keys shown in code.
An empty default means the stored default is an empty string, not a missing value.
The assistant request itself uses Google Gemini when an API key is configured; attached and selected context is sent to Google for that request.
Optional semantic search has separate provider settings and privacy choices below.

## Assistant (Google Gemini)

- **API key** — `apiKey`; default: **empty**. Stores the Google AI key locally in plugin `data.json`; set it before asking the assistant, and do not commit it. It authenticates requests that send assistant context and questions to Google.
- **Model** — `model`; default: `gemini-3.8-flash`. Selects the Gemini model used for assistant responses; change it after **Fetch list** confirms models available to the key.
- **Fetch list** — `models`; default: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-pro`, `gemini-2.5-flash`. This stored list feeds the Model dropdown; refresh it when the key can use different models.
- **Temperature** — `temperature`; default: `0.8`. Controls response variation from 0 to 1.5; lower it for more predictable table answers.
- **System prompt** — `systemPrompt`; default: the built-in **You co-run a tabletop RPG session** GM prompt. It sets the assistant's role, brevity, canon, suggestion, scene, NPC, mechanics, and read-aloud rules; change it only when you need a different standing instruction.
- **Context limit (characters)** — `maxContext`; default: `24000`. Limits included note text for a question; lower it when a smaller request is needed.
- **Retrieval budget (tokens)** — `contextBudgetTokens`; default: `6000`. Caps total pinned and retrieved context using the plugin's character-to-token estimate; lower it to constrain context.
- **Maximum tool steps** — `maxToolSteps`; default: `5`. Caps read-only assistant tool rounds for one answer; raise it only when an answer needs more lookups.
- **Active run pointer** — `activePointerPath`; default: `Active.md`. Names the note that points to the active run; change it only for a deliberately relocated pointer.
- **Campaign note override** — `campaignPath`; default: **empty**. Overrides the campaign selected by the active run; leave it empty to use the current run.
- **World-day note override** — `worldDayPath`; default: **empty**. Overrides the active run's world-day note; leave it empty to use the current run.
- **Run** — `includeCampaign`; default: `true`. This assistant-view toggle includes campaign, run, and state context; turn it off for a deliberately narrower request.
- **Today** — `includeWorldDay`; default: `true`. This assistant-view toggle includes the world date, moon, and season; turn it off when time context is irrelevant.
- **Note** — `includeActiveNote`; default: `true`. This assistant-view toggle includes the active Markdown note; turn it off when that note should not be sent.
- **Combat** — `includeCombat`; default: `true`. This assistant-view toggle includes the tracker summary; turn it off outside combat.
- **Search** — `contextRetrieval`; default: `true`. This assistant-view toggle retrieves relevant scoped notes; turn it off to use only pinned context and attachments.
- **Embedding provider** — `embeddingProvider`; default: `none`. **None** keeps retrieval local; choose `ollama` for a local embedding service or `gemini` only when sending note text to Google is acceptable.
- **Ollama URL** — `ollamaUrl`; default: `http://127.0.0.1:11434`. Names the local Ollama endpoint for embeddings; change it when your local service uses another address. Note text is sent to that configured endpoint.
- **Ollama embedding model** — `ollamaModel`; default: `embeddinggemma`. Selects the Ollama embedding model; change it to match the local model you installed.
- **Gemini embedding model** — `geminiEmbeddingModel`; default: `gemini-embedding-001`. Selects the Gemini embedding model; this provider sends note text to Google.
- **Embedding dimensions** — `embeddingDimensions`; default: `768`. Sets the requested Gemini vector size and stored vector format; change it only with a compatible embedding model.
- **Test embedding provider** — no stored key. It tests the selected provider and reports returned dimensions; use it after changing provider, URL, model, or dimensions.

The **API key**, Model, and assistant request flow use Google Gemini when you send a question.
`embeddingProvider: none` sends no note text to an embedding provider; `ollama` sends it to the configured Ollama URL; `gemini` sends it to Google.

## Table home

- **Open table home on startup** — `openHomeOnStartup`; default: `true`. Opens the home view after Obsidian restores the layout; turn it off when you prefer to open it manually.

## Combat

- **Bestiary folder override** — `bestiaryPath`; default: **empty**. Replaces the shared and campaign homebrew bestiary folders; set it for a custom creature location.
- **Party folder override** — `partyPath`; default: **empty**. Replaces the party folder derived from the active run; leave it empty to use the current run.
- **Average enemy hit points** — `useAverageHitPoints`; default: `true`. Uses statblock HP instead of rolling `hit_dice`; turn it off to roll enemy hit points.
- **Shared initiative for groups** — `groupInitiative`; default: `true`. Lets identical added creatures act together; turn it off when every creature needs an independent initiative.
- **Attack bonus phrases** — `attackBonusPhrases`; default: `to hit`. Supplies comma-separated phrases following attack bonuses in statblocks, so those bonuses become clickable rolls; change it for another statblock wording.

## Choosing safely

Leave pointer, path, and empty override settings alone until the active-run defaults do not match your vault layout.
Use the assistant toggles per request to control what context is included.
Use **Assistant: rebuild index** after changing source material or embedding configuration substantially.
See [Table Tools at the table](TABLE-TOOLS.md) for the controls these settings affect.
See [Assistant retrieval](ASSISTANT.md) for scope, requests, tools, local indexing, and provider behavior.
