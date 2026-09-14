# Table home

Open **Table Tools: Home** from the home ribbon icon or the command palette. It opens a main-area tab with the active run, its campaign, system, party, and world day. The same tab lists every campaign, its runs, and every party.

Use **Make active** on a run to update `Active.md`. The assistant scope and the combat tracker then use that run's campaign and party. The `Home.md` note remains a simple introduction; it is not a dashboard.

The home opens after startup by default. Change this in **Settings > Table Tools > Table home**.

## Create table material

Use **New campaign**, **New party**, or **New run** in the home. A campaign chooses an installed system; a run chooses its role, campaign, and party and can become active immediately. Creating a run also makes its `State.md` and `World Day.md` notes.

Creation reads a same-named template from `_local/templates/` first and otherwise from `_system/templates/`. It expands the two bundled Templater values for the new title and folder, removes any other Templater command, and writes complete note contents. This prevents Templater folder templates from executing a second time on the created note.
