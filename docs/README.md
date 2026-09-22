# RPGVault manual

This manual starts with a new vault and then moves from its model to daily operation.
Read the first three pages in order if you are setting up a vault for the first time.
Use the later reference pages when you need a specific command or diagnosis.
All command examples use the CLI shipped with this vault.

## Start here

- [Getting started](GETTING-STARTED.md) answers: how do I turn a clone into my first active game?
- [Concepts](CONCEPTS.md) answers: which layer, content root, note, and state file owns this information?
- [Architecture](ARCHITECTURE.md) answers: how do the shipped, local, content, system-package, and radar boundaries fit together?
- [CLI reference](CLI.md) answers: what does each `rpgvault` command write, print, and require?
- [Troubleshooting](TROUBLESHOOTING.md) answers: what does a `doctor` violation mean and how do I fix it?

## Working in the vault

- [Table home](HOME.md) answers: how do I create campaigns, parties, runs, and choose the active run?
- [Assistant retrieval](ASSISTANT.md) answers: which notes can the assistant search and how is local indexing handled?
- [Customising Table Tools](CUSTOMISING.md) answers: how do I localise labels and keep my own plugins, themes, and snippets?
- [Authoring systems](AUTHORING-SYSTEMS.md) answers: how do I describe note shapes without shipping published rules text?
- [Adopting an existing vault](ADOPTING.md) answers: how do I import folders and selected plugin data through a map?
- [Upgrading](UPGRADING.md) answers: how do releases, backups, and migrations update a vault?

## Design records

- [ADR 0001: release zip plus migrations](adr/0001-update-mechanism.md) answers: why does update replace `_system` from an offline release?
- [ADR 0002: active run pointer location](adr/0002-active-pointer-location.md) answers: why is `Active.md` root user state?
- [ADR 0003: assistant retrieval](adr/0003-assistant-retrieval.md) answers: why is retrieval local, scoped, and lexical-first?

## Reading order

Start with Getting started before changing anything in a fresh clone.
Read Concepts before deciding whether a file belongs in shipped or local state.
Open the Table home page when you are ready to create your own records.
Keep the CLI reference nearby when working from a terminal.
Use Troubleshooting after every unexpected `doctor` result.
The specialised pages explain one subsystem without replacing this shared model.
The design records explain decisions rather than operational instructions.
Updates preserve your content and local layer, but always read Upgrading before running one.
Adoption is for an existing vault and requires a map file, so read it only when importing.
The assistant page explains privacy and scope before enabling optional semantic search.
