# Gerombolan

**You've seen the advertisements. Now play the game, without them.**

Steer your crowd through gates that add, subtract, multiply and divide it, survive the raids, and
pick your upgrades along the way. It never ends, it only gets harder, so the only question is how
far your gerombolan gets. Free, open source, and without a single advertisement.

*Gerombolan* is Indonesian for a mob: a big, unruly crowd. Ours runs down a Jakarta street, past
ruko, angkot and food carts, with Monas on the horizon.

> **Early days.** What's here is a playable prototype: the street, the gates and the raids.
> Upgrades, harder raids, a daily run and leaderboards come next. There's no release to download
> yet.

## Playing

| Key | Does |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> | Steer |
| <kbd>Space</kbd> or <kbd>Enter</kbd> | Start a run |

Blue gates help, red gates hurt, and every raid costs you one runner per raider. The number above
your crowd is all that matters: when it reaches zero, the run is over.

## How it works

Every run comes from a **seed**: the gates and raids are generated from it, so the same seed and
the same steering always give the same run, on any computer. That's what will let the
leaderboards check a score by replaying the run, instead of trusting whatever number arrives.
The simulation (`src/lib/game/simulation.ts`) only uses integer math for that reason, and a test
fails if it ever reaches for anything that could differ between JavaScript engines.

Everything you see is drawn with [Three.js](https://threejs.org) from simple shapes built in
code: no downloaded models. The window around it is [Tauri](https://tauri.app), and Gerombolan
makes no network requests.

## Development

You need Node 24, pnpm 12 and Rust (stable), plus
[Tauri's system dependencies](https://tauri.app/start/prerequisites/).

| What | Command |
| --- | --- |
| Install | `pnpm install` |
| Run the game in development | `pnpm tauri dev` |
| Type-check | `pnpm check` |
| Test the simulation | `pnpm test` |
| Build the application | `pnpm tauri build` |

Conventions are in [`.handbook/`](.handbook/), a link to Itrium's handbook.

## License

The code is [MIT](LICENSE). The name **Gerombolan** and its logo are not covered by the license:
a fork is welcome, under a name of its own.
