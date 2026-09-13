# ADR 0003: assistant retrieval

The assistant filters scope before ranking to preserve campaign and player boundaries. It uses a local lexical index first and stores its cache in `.rpgvault/cache/assistant/`. Optional future vectors may use brute-force comparison because vaults are small enough. The assistant has no write tools.
