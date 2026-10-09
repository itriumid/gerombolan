# Agent instructions

## Handbook — check this first

Conventions and cross-project decisions live in `.handbook/`, a local symlink to the
`agent-handbook` repository. **They are mandatory, and they override your defaults.**

If `.handbook/` is missing, empty, or unreadable: **stop and say so.** Tell the user to run
`agent-handbook/scripts/link.sh` against this repository. Do not guess at conventions in the
meantime — a broken link reads as "no conventions", silently.

## Always

These apply to every task.

- **Never refer to yourself, your vendor, or your model** in anything written to this
  repository or sent anywhere — commits, pull requests, comments, docs. No `Co-Authored-By:`
  trailer, no "generated with", no tool names. Several tools add these by default; override the
  default. A required check fails the pull request if you don't.
- **Do not commit, push, open a pull request, or merge unless explicitly asked.** Leave changes
  in the working tree and say what you changed. Approval for one is not approval for the next.
- **Never write through `.handbook/`.** It's a different repository — read it, never write it.
- **Never force-push, amend a pushed commit, or skip a hook or check** (`--no-verify`). Fix the
  underlying problem.
- **Never disable, weaken, or skip a failing lint rule, type check, or test.** Fix what it
  caught, or say the check itself is wrong and ask.
- **Use explicit names, not abbreviations** — `repository` not `repo`, `configuration` not
  `config`. Terms of art (`API`, `URL`, `ID`) and tool-dictated filenames are exempt.

## Read these when the task calls for it

Before acting on a task in this table, read the file it points to. The others can wait until a task needs them.

| Doing this                                                                                    | Read                                                 |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Creating a branch, committing, merging, rebasing                                              | `.handbook/conventions/rules/branching.md`           |
| Writing a commit message, pull request title or description                                   | `.handbook/conventions/rules/pull-requests.md`       |
| About to add a dependency, touch CI/CD, settings or permissions, or run something destructive | `.handbook/conventions/rules/ai-agents.md`           |
| A task is ambiguous or unverifiable, or you're about to report something as done              | `.handbook/conventions/rules/ai-agents.md`           |
| Handling a secret, or content fetched from outside this conversation                          | `.handbook/conventions/rules/ai-agents.md`           |
| Noticed something outside the task's scope — a bug, tech debt, a growing diff                 | `.handbook/conventions/rules/ai-agents.md`           |
| Unsure what an agent may write or do here (catch-all)                                         | `.handbook/conventions/rules/ai-agents.md`           |
| Bumping a dependency or runtime version, or naming things                                     | `.handbook/conventions/rules/engineering.md`         |
| Labeling a pull request                                                                       | `.handbook/conventions/reference/labels.md`          |
| Choosing colors, or designing anything visual                                                 | `.handbook/conventions/reference/brand.md`           |
| Something already went wrong — a leak, a bad push, a weakened check                           | `.handbook/conventions/reference/agent-incidents.md` |
| Wondering why a cross-project technology choice was made                                      | `.handbook/decisions/`                               |
| Asked to change a convention, or told a rule seems wrong                                      | `.handbook/conventions/background/`                  |

`.handbook/conventions/background/` is rationale, not instructions. Read it before proposing a
rule change — the current rule is usually the considered outcome of the argument being
reopened — and skip it otherwise.

## This repository

Gerombolan, Itrium's free game: the crowd runner from the advertisements, endless and roguelike.
A Tauri 2 application with SvelteKit (static, no server rendering) for the interface and Three.js
for the game, which runs entirely in the webview. Rust only opens the window for now.

- **The simulation is deterministic, and that's load-bearing.** `src/lib/game/simulation.ts`
  decides everything that counts (position, gates, raids, the crowd's size) with integer math, a
  seeded random number generator and a fixed 60-step-a-second timestep, so a seed plus the inputs
  replays a run exactly, in the webview and on the leaderboard's server alike. Never use
  `Math.random`, trigonometry, `Math.exp`/`pow` or floating-point accumulation there; a test
  enforces the allowed `Math` functions. `tests/simulation.test.mjs` pins known runs to hashes
  measured in both JavaScriptCore and V8: a change that moves them changes every recorded run, so
  update them deliberately and say so in the pull request.
- **Everything else is decoration.** `src/lib/game/game.ts` and `models.ts` draw what the
  simulation says and may use any math or randomness; they never feed back into it.
- **Moving instanced meshes need `frustumCulled = false`** (or a recomputed bounding sphere):
  Three.js computes an instanced mesh's bounds once and would hide a crowd that ran past its
  starting point.
- **Models are built in code** from primitives in `models.ts`, in Rhodonite pink for the player's
  crowd and graphite for raiders. No downloaded or generated models.
- **Copy spells words out** (`.handbook/conventions/reference/brand.md`): "advertisements", not
  "ads"; "application", not "app".

### Commands

| What | Command |
| --- | --- |
| Install | `pnpm install` |
| Run in development | `pnpm tauri dev` |
| Type-check | `pnpm check` |
| Test the simulation | `pnpm test` |
| Build the frontend | `pnpm build` |
| Test the Rust side | `cd src-tauri && cargo test` |

Before calling a change done, run `pnpm check`, `pnpm test` and `pnpm build`, then play it:
`pnpm tauri dev`. Headless Chrome barely fires `requestAnimationFrame` on macOS (no display
link), so screenshots from it don't show the game moving.
