# Table home

Open **Table Tools: Home** from the home ribbon, the command palette, or the **Open table home** command.
The view opens in the main area and, by default, opens after Obsidian restores the vault layout.
Change **Open table home on startup** in [Table Tools settings](SETTINGS.md) if you prefer to open it yourself.

## Active run and lists

When `Active.md` points to a complete run, the **Active run** card shows the run folder name, its role, campaign, system, party, and the first non-heading line from its world-day note.
The role is shown as **Game master** or **Player**.
The card actions are **Open run**, **Open campaign**, **Open party**, **Open assistant**, and **Open combat tracker**.
They open the selected note or the corresponding Table Tools view.

The **Campaigns** section lists every note with `type: campaign`, its resolved system name, and **Runs: <count>**.
Campaign cards have an **Open campaign** action.
Runs are grouped below their campaign by the run's campaign link; runs without a resolved campaign link appear under **Runs without a campaign**.
Each run card shows its folder name, **Game master** or **Player** role, resolved party, and **Make active**.
**Make active** rewrites the root active-run pointer and refreshes the home, assistant, and combat context.

The **Parties** section lists every note with `type: party` and **Members: <count>**.
The count is the number of list items under that party note's `## Members` heading, stopping at the next level-two heading.
Party cards have an **Open party** action.
An empty vault shows **No campaigns, runs, or parties yet.**

## Create actions

The top of the view has **New campaign**, **New party**, and **New run** buttons.
Every form ends with **Create** and checks the **Name** field before writing anything.
A name cannot be blank or contain `\\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, `#`, `^`, `[` or `]`.
Invalid input reports **Enter a valid name.**
If the destination folder or a note inside it already exists, the form reports **That folder already contains a note.**

### New campaign

**New campaign** asks for **Name** and **System**.
The System dropdown lists installed system packages and starts with `generic` when available.
It creates `Campaigns/<name>/Campaign.md` with `type: campaign` and the selected system.
The created note opens and the home view refreshes.

### New party

**New party** asks only for **Name**.
It creates `Parties/<name>/Party.md` with `type: party`.
The created note opens and the home view refreshes.

### New run

**New run** asks for **Name**, **Role**, **Campaign**, **Party**, and **Make active after creating**.
Role offers **Game master** and **Player**; Campaign and Party list notes by their `type` frontmatter.
Both Campaign and Party are required, otherwise the form reports **Choose both a campaign and a party for the run.**
It creates `Runs/<name>/Run.md` with role, campaign, and party links, plus `State.md` and `World Day.md`.
The make-active switch starts on, so a normally created run also updates `Active.md`.
Turn it off when creating preparation material that should not become the table's current run.

## Templates and updates

When a recorded update is newer than the installed RPGVault, the top of the home view shows its version and the command to run.
On desktop Obsidian, choose **Install update** to open a report headed **Installing RPGVault update**.
The report streams the CLI output while it works; a successful run ends with **Update complete. Reload Obsidian to use the new version.**
If it cannot complete, the report says **RPGVault update failed.** and stays open so its output can be copied.
On a phone, the banner still names the command, but no install button is available.

The creation forms read `_local/templates/campaign.md`, `_local/templates/party.md`, or `_local/templates/run.md` first.
When a same-named local template is absent, they read the matching file from `_system/templates/`.
They replace the title and folder Templater values, remove other Templater commands, preserve non-form frontmatter, and write a complete note.
Use local templates for vault-specific creation changes; an update replaces shipped `_system` content but leaves `_local` alone.

## Next actions

Use [Table Tools at the table](TABLE-TOOLS.md) to add those campaign and party records to combat.
Use [Assistant retrieval](ASSISTANT.md) after making a run active to understand the GM and player scopes.
Use [Getting started](GETTING-STARTED.md) for the first-hour sequence around these controls.
