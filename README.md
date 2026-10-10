# B.O.T.S

B.O.T.S (Bots in its code, its repository and its plugin id, `bots`) is the desktop companion for [Boite](https://github.com/beboite/boite): little robots that sit on your desktop, watch your agents work and let you talk to them without opening Boite's window.

Bots is a Boite plugin with its own window. Boite installs it, starts it, and hands it the address of the Boite core and a token to talk to it. When you quit Bots from its tray icon, it stays stopped until Boite starts it again.

## Install

In Boite, open **Settings > Plugins**, add `https://github.com/beboite/bots`, and confirm. Boite downloads the executable for your system from this repository's releases, checks its sha256 against [`boite-plugin.json`](boite-plugin.json), and starts it.

The tray icon has **Settings** (the robots, their reminders, the screen they sit on) and **Quit**.

## Running it by hand

Bots finds the core in this order:

1. `BOITE_CORE_URL` and `BOITE_TOKEN`, which Boite sets when it starts Bots.
2. `core.json` in Boite's data folder (`BOITE_DATA_DIR`, else `%LOCALAPPDATA%\boite2`, `~/Library/Application Support/boite2` or `$XDG_DATA_HOME/boite2`), read the way Boite's CLI reads it.
3. Neither: the robots wait, say "Start Boite to wake the bots", and look again every few seconds.

A second launch brings the running Bots forward instead of starting another one.

## Development

Bots is Tauri 2, Svelte 5, Vite and TypeScript, built with [Bun](https://bun.sh) (the version in `package.json`'s `packageManager`) and stable Rust. On Linux, install the WebKit dependencies first: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`.

```sh
git clone --recurse-submodules https://github.com/beboite/bots
cd bots
bun install --frozen-lockfile
bun run check          # svelte-check, then the scripts' types
bun run test           # vitest
bun run test:scripts   # the release scripts
bun run check:manifest # boite-plugin.json against Boite's own reader
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

### Demo mode

The demo runs the robots on Boite's in-memory fake core: no Boite needed.

- In a browser: `bun run dev`, then open `http://localhost:5174/?fake=1` (add `&hud=1` for busy agents and quotas, or open `?view=settings&fake=1` for the settings).
- In the desktop window: `BOTS_DEMO=1 bun run tauri dev` (`BOTS_DEMO=hud` for the busy version). Development builds only.

### Against a throwaway core

Never point a development build at the Boite you use every day. Start a core from the submodule on a fresh data folder instead:

```sh
cd vendor/boite && bun install --frozen-lockfile && cd ../..
scratch=$(mktemp -d)
BOITE_ECHO=1 BOITE_HOST_AGENTS=0 bun vendor/boite/packages/core/src/main.ts --port 0 --data-dir "$scratch"
# in another terminal: Bots reads that core's core.json
BOITE_DATA_DIR="$scratch" bun run tauri dev
```

Stop the core before deleting `$scratch`.

### The `vendor/boite` submodule

Bots shares Boite's protocol types and UI pieces (the client, the theme, i18n, the chat renderer) instead of copying them: `vendor/boite` is a shallow submodule of Boite, and the build aliases `@boite/contracts` and `@boite/ui/*` into it (`vendor.config.ts`, `tsconfig.json`). Bots keeps its own robots, faces, sounds, the companion's code and its own `strings.en.ts` and `strings.fr.ts`.

A submodule rather than a package: Boite publishes no packages, and pinning a commit keeps Bots building against exactly the protocol it was tested with.

To move to a newer Boite:

```sh
cd vendor/boite
git fetch --depth 1 origin <commit>
git checkout <commit>
cd ../..
bun run check && bun run test && bun run check:manifest
git add vendor/boite
git commit -m "chore(vendor): bump boite to <short commit>"
```

Check the protocol version and the RPCs Bots calls (`ui.reveal` among them) when you bump.

## Releasing

1. Run the **Release** workflow from the Actions tab with the version, without the `v` (`0.2.0`).
2. It builds raw executables with `tauri build --no-bundle`: `bots-x86_64-pc-windows-msvc.exe`, `bots-aarch64-apple-darwin`, `bots-x86_64-apple-darwin`, `bots-x86_64-unknown-linux-gnu`, and the arm64 Windows and Linux ones when those runners succeed. It publishes them, with `SHA256SUMS.txt`, as release `v<version>`.
3. It then opens a pull request that writes the version, the URLs and the sha256 into `boite-plugin.json` (`scripts/release-manifest.ts`). Boite offers the new version once that pull request is merged.

The sha256 values in `boite-plugin.json` stay all zeros until the first release: they are filled by the release workflow.

## Contributing

Pull requests are welcome. Every change to `main` goes through a pull request and needs a maintainer's approval before it is merged. CI runs the typecheck, the tests, the manifest check, and `cargo test` and clippy on Windows and Linux. [AGENTS.md](AGENTS.md) lists the rules the code follows.

## License

MIT, see [LICENSE](LICENSE).
