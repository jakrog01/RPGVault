# Customising Table Tools

Table Tools uses English strings by default. To override selected labels locally, create `_local/plugins/table-tools/strings.json` in your vault. The file is read when the plugin loads. Unknown keys are ignored, and malformed JSON leaves the English strings active after showing a notice.

```json
{
  "combat": "Encounter",
  "openCombat": "Open encounter tracker",
  "assistant": "Game assistant"
}
```
