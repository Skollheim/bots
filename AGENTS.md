# Working on Bots

Bots is Boite's desktop companion as a Tauri 2 + Svelte 5 app. Read the
[README](README.md) for setup, the demo mode and releases.

## Commands

```sh
bun install --frozen-lockfile
bun run check
bun run test
bun run test:scripts
bun run check:manifest
cargo test --manifest-path src-tauri/Cargo.toml
```

## Rules

- English for code, comments, docs and commits. Conventional commit messages:
  `type(scope): summary`.
- UI strings live in `src/lib/strings.en.ts` and `src/lib/strings.fr.ts`, with
  the same keys. French UI uses "vous".
- Colours come only from CSS variables. No native `<select>`, no
  `window.confirm`. No regex lookbehind. Files stay at or under 900 lines.
- `vendor/boite` is read-only: import from it through `@boite/contracts` and
  `@boite/ui/*`. When a module would pull in Boite's whole store, copy the
  small module into `src/` with its source path and commit in a header.
- The robots' look is original, and sounds are synthesized in code, never
  sampled.
- Bots talks to Boite only through the core's RPC (`ui.reveal` to show a thread
  or an agent in Boite). It never reads Boite's files beyond `core.json`.
- Tests and manual runs use a throwaway core on a temporary data folder, never
  the data of a Boite someone uses.
- Native commands check which webview calls them (`only_companion`: the
  companion's window is Bots's only page), and every command is listed in
  `src-tauri/permissions/bots.toml` and covered by `src-tauri/src/acl.rs`.
- Quit exits with code 0; any other exit tells Boite to start Bots again.
