# Table Tools at the table

Table Tools adds the Home, Combat, and Assistant views to Obsidian.
The active run selected in [Table home](HOME.md) supplies campaign, party, and system context to the other views.
Use the three ribbon icons or the command palette to open the views.

## Ribbons and commands

The home ribbon is **Table Tools: Home** and opens the table home.
The combat ribbon is **Table Tools: Combat** and opens the combat tracker.
The assistant ribbon is **Table Tools: Assistant** and opens the assistant.

| Command id | English command label | What it does |
| --- | --- | --- |
| `open-combat` | **Open combat** | Opens the combat view. |
| `open-assistant` | **Open assistant** | Opens the assistant view. |
| `open-home` | **Open table home** | Opens the home view. |
| `assistant-rebuild-index` | **Assistant: rebuild index** | Rebuilds the assistant index. |
| `combat-next-turn` | **Combat: next turn** | Advances the active combat turn. |
| `combat-previous-turn` | **Combat: previous turn** | Moves the active combat turn back. |
| `combat-roll-initiative` | **Combat: roll initiative** | Rolls initiative for combat participants. |
| `combat-clear` | **Combat: clear** | Clears the current combat. |
| `assistant-ask-selection` | **Assistant: ask about the selected text** | Opens the assistant and sends the editor selection; without a selection it says **Select some text first.** |

## Combat tracker

Open **Combat** from the ribbon, command palette, home card, or the **Open combat** command.
The toolbar has **Players**, **Enemy**, and **Initiative** for adding party members, adding a bestiary creature, and rolling initiative.
Before combat starts, **Start** begins round 1 and rolls initiative for participants without one.
Once active, **Previous** and **Next** move the turn; the tracker skips defeated non-player participants.
The **Round** display shows the current round or an em dash before start.
The right-side buttons open **Encounter sets**, **Save to the active note**, and **New combat (clear)**.
Clearing an occupied combat asks **Clear the combat?** and requires **Clear**; an empty combat clears immediately.

### Difficulty and participant table

When there is at least one player and one enemy, the difficulty bar shows raw XP, adjusted XP, player count, and thresholds.
Its possible level names are **trivial**, **easy**, **medium**, **hard**, and **deadly**.
The participant table columns are **Init**, **Name**, **AC**, **HP**, **Damage / +heal**, and **Conditions**.
Initiative is editable in its number field; the row name also shows CR, level, and any GM note.
HP shows current and maximum values, a health bar, and temporary HP when present.
In **Damage / +heal**, enter a plain number such as `12` to deal damage, `+5` to heal, or `t 5` to set temporary hit points.
Press Enter to apply the entry; Shift+Enter makes a plain number heal instead of damage.
An invalid value shows **Enter a damage amount, +N to heal, or tN for temporary hit points.**

Condition chips display the participant's conditions and can be clicked to remove them.
Use the plus button labelled **Add condition** to choose more conditions.
Each row also has **Edit participant**, a visibility toggle labelled **Hidden from the players** or **Visible to the players**, and **Remove**.
Click a row outside an input or button to select it for the card below.

### Cards, log, sets, and export

The selected participant's statblock card shows its note link, AC, HP, speed, abilities, saves, skills, defences, senses, languages, challenge, and available traits or actions.
Clickable ability modifiers and recognised attack bonuses roll dice and add the result to the combat log.
A selected source note without a statblock says **This note has no statblock.**; a manual participant says **Entered manually, without a statblock.**
The **Log** panel shows the most recent combat events, including additions, initiative, rounds, damage, healing, temporary HP, removals, and rolls.

An encounter set is a saved list of source-backed enemies prepared before a session.
Open **Encounter sets** to load a set, delete one, or **Save the current enemies as a set** with a name and description.
Loading adds the set's enemies to the current combat; saving stores encounter sets in Table Tools plugin data.
**Save to the active note** appends a combat callout with the initiative table and recent log to the active Markdown note.
If no note is open, the same export is copied to the clipboard and reports **No open note; the combat was copied to the clipboard.**

## Where creatures and players come from

The **Enemy** picker reads creature notes with `type: creature` and notes inside configured bestiary folders.
Without an override, those folders are `Library/Mechanics/<system>/Bestiary` and the active campaign's `Mechanics/Bestiary`.
Creatures may use a fenced `statblock` YAML block or a `monster` frontmatter value; the note basename is used when a statblock has no name.
The **Players** picker reads `type: npc` with `subtype: pc`, plus notes in the active party folder except its folder note and `Party.md`.
Party frontmatter can provide HP, AC, `init_mod`, and level; missing values can be filled in from the add-players form.
The active run determines the campaign, party, and system used by those default folders.

## Everyday flow

Add players and enemies, review the difficulty bar, then press **Start** when initiative is ready.
Use the row inputs and condition chips during play, and use **Next** or the command palette at turn changes.
Save an encounter set when a group should recur later.
Export the combat to an open session note before clearing it.
The Settings reference documents bestiary, party, hit-point, group-initiative, and attack-roll controls.
See [Assistant retrieval](ASSISTANT.md) for how combat state can be attached to a request.
