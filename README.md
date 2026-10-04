# hf-harness

A best-of-N agent harness **server** around the vendored [HyperFrames](https://github.com/heygen-com/hyperframes) skills in `./hyperframes`, built to get the best possible **motion graphics**, **product launch videos**, and **short videos**.

One brief becomes N variants with deliberately different creative seeds. Each variant is built by an agent following the owning HyperFrames workflow, gated by checks the workflows don't run on their own, judged blind from proof frames, and ranked. The winner is kept, and every decision feeds a memory that seeds later runs.

```
brief ─► seeds (diverse, learned) ─► N variant projects ─► build (agent driver)
                                                            │
                         repair packet ◄── hard fail ◄── gates: static + hyperframes check + seam gate + snapshots
                                                            │ pass
                                     compare sheets ─► blind judges (rubric, evidence, fatal flags)
                                                            │
                         DECISION.md + memory/lessons.jsonl ◄── 0.35 × technical + 0.65 × judge, vetoes
```

## Why a harness on top of the skills

The HyperFrames workflows (`motion-graphics`, `product-launch-video`, `general-video`) are excellent pipelines, but each produces **one** take and verifies it with `lint`, `check`, and `snapshot`. The repo's own taste law (`.claude/skills/motion-doctrine`, `cut-the-curve`, `seam-craft`) and its numeric seam gate are wired into only one internal workflow. The harness closes those gaps:

| Gap | What the harness adds |
| --- | --- |
| `hyperframes check` passes idle wobble (a `repeat: -1` yoyo "breathe" scores green) | `motion` gate: idle loops, bounce/elastic eases, slow entries, stagger, and ease sprawl, per motion-doctrine Part 2 |
| Seams authored scene by scene; no vector ledger | `ledger` gate (axis/direction match, ping-pong, reserved-vector sprawl, transition budget, crossfades) plus the vendored numeric **seam gate** in headless Chrome |
| Non-deterministic renders slip through | `determinism` gate: `Math.random`, clocks, network, time-driven loops |
| Text-heavy frames | `density` gate: words per second, longest block, minimum type size scaled to the canvas |
| One take, no comparison | N seeded variants, side-by-side compare sheets, blind judges with an anchored rubric |
| Run 50 is no better than run 2 | `memory/lessons.jsonl`: slot 1 exploits the axis values that have won for that genre; the other slots explore |

`check` is still run, tuned per genre with `--at-transitions`, `--frame-check`, and a caption keep-out band.

## Run it

```bash
git submodule update --init   # the vendored HyperFrames clone in ./hyperframes (or clone with --recurse-submodules)
npm install
npm run server          # http://localhost:8100, dashboard at /ui
npm test                # unit tests for gates, seeding, judging, decisions
npm run typecheck
```

Requirements: Node 22 or newer and Chrome, which HyperFrames finds via `npx hyperframes browser path`. **ffmpeg is needed only for rendering**: without it every gate and snapshot still works, and `POST /runs/:id/render` returns 409 with the command to run elsewhere.

## Drivers and LLM providers

Put keys in `harness/.env` (copy `.env.example`). The variable names match `agent/.env`, so the same keys work in both.

| Driver id | As **builder** | As **judge** | Needs |
| --- | --- | --- | --- |
| `zai` | The harness's own agent loop drives GLM through the workflow | GLM vision model over the proof frames | `ZAI_API_KEY`; `ZAI_MODEL` (default `glm-5.3-flash`); judging also needs `ZAI_VISION_MODEL` |
| `gemini` | Same agent loop on Gemini | Gemini vision | `GEMINI_API_KEY`; `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), optional `GEMINI_VISION_MODEL` |
| `dashscope` | Same agent loop on Qwen | Qwen-VL | `DASHSCOPE_API_KEY`, `DASHSCOPE_MODEL` / `DASHSCOPE_VISION_MODEL` |
| `openai` | Any other OpenAI-compatible endpoint | Same | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` |
| `claude-agent` | Claude Agent SDK in the variant directory | Read-only Agent SDK session | `ANTHROPIC_API_KEY` |
| `external` | Server publishes a packet per variant; any agent builds and calls `POST .../built` | Scorecards arrive via `POST /runs/:id/scorecards` | nothing |

Choose per run (`"builder": "zai", "judge": "gemini"`) or set defaults with `HARNESS_BUILDER` / `HARNESS_JUDGE`. Override models per run with `builderModel` / `judgeModel`, or globally with `HARNESS_BUILDER_MODEL` / `HARNESS_JUDGE_MODEL`. **Build and judge on different providers**: a model tends to prefer its own family's output.

**The agent loop** (`src/llm/agent.ts`) gives OpenAI-compatible models six tools: `read_file`, `list_files`, `write_file`, `edit_file`, `run_command`, and `finish`.
- **Reads:** the variant directory, the vendored skills, and the run directory.
- **Writes:** only the variant directory.
- **Commands:** run in bash (Git Bash on Windows). Commands that would break the run (`hyperframes render`, `preview`, `publish`, `skills update`, git, recursive deletes outside the variant) are refused.
- **Workflows that dispatch sub-agents:** the loop has no sub-agent tool, so the model does that work itself, one unit at a time, following the workflows' documented no-delegation fallback.
- **Gemini 3:** tool calls are echoed back verbatim, which keeps its thought signatures intact.
- **Long runs:** old tool output is elided once the transcript passes `HARNESS_AGENT_CONTEXT_CHARS` (default 150k characters).

It is scoped by working directory and a denylist, **not a sandbox**: commands run with the server's own permissions.

Judges never see seeds, gate scores, or build notes, and the labels (A, B, C) are shuffled per run. A scorecard is rejected (422) unless every rubric dimension has an integer score from 1 to 10 and evidence citing a frame time.

## Spend limits

Every model-driven build has a hard budget, whichever runs out first. It is set per genre (`budget` in `genres/*.json`), and an env var overrides it for every genre:

| Limit | Motion graphics | Product launch / short video | Env override |
| --- | --- | --- | --- |
| Turns | 25 | 40 | `HARNESS_BUILDER_MAX_TURNS` |
| Input tokens | 600k | 600k | `HARNESS_BUILDER_MAX_INPUT_TOKENS` |
| Minutes | 8 | 12 | `HARNESS_BUILDER_MAX_MINUTES` |

A builder turn resends the packet plus history, about 26k input tokens on a motion graphic, so 600k is roughly 20 turns: enough to write the film, self-gate in the browser, and fix what the gate finds. A tighter cap stops builders before the browser self-gate, and layout errors then cost a repair round instead.

Other time savers:
- **The CLI runs without npx.** `hyperframes@<pinned>` is a harness dependency and runs as `node node_modules/hyperframes/bin/hyperframes.mjs`; `npx --yes` re-resolves the package on every call (about 10s each). Builders get the same command.
- **A brand kit per run.** After the capture, the harness resolves the site's fonts (captured, auto-resolved by HyperFrames, Google Fonts, or a named substitute) and downloads its logo images into `capture/assets/logo/`, then gives builders the exact `@import` line and logo path (`capture/brand-kit.json`). Undeclared brand fonts used to hard-fail every build.
- **Static self-gates include HyperFrames lint,** so lint errors show up seconds after the film is written instead of after the build ends.
- **Captures are reused:** a site captured by another run in the last 24 hours is copied, not re-captured (`HARNESS_CAPTURE_MAX_AGE_HOURS`).
- **Builders self-check with `"quick": true`,** which skips proof snapshots and seam measurement. The harness runs the full gate once each build is done.
- **Judges run in parallel.**

- **Repair rounds get half.** At 80% the builder is told to wrap up; at 100% it is stopped. A build stopped at its budget with a real `index.html` still goes to the gates and the judge, so the spend isn't wasted.
- **Defaults are 2 variants and 1 judge** per run; ask for more with `n` and `judges`.
- **A server restart never starts paid work.** Runs with a model builder or judge come back **paused**: use the dashboard's Resume button or `POST /runs/:id/resume`. `POST /runs/:id/pause` stops in-flight builds without failing them.
- **Builders can't read HyperFrames' source** (`packages/`, `scripts/`, `node_modules/`), and are told to stop once nothing hard is failing.
- **The dashboard shows each variant's spend:** tokens and minutes.

## Assets

The harness is self-contained: its asset library is `harness/assets/` (261 assets: logos, photos, screenshots, illustrations, icons, textures, Lottie), and uploads land in `harness/assets/custom/`. Each asset's size and transparency are read from the file itself; names, tags and descriptions come from its `*.geo.json` / `*.asset.json` sidecar or the folder's `index.json`.

- **Brief:** `"assets": ["official/stripe_official_logo", {"id": "paper/paper-grain-texture", "role": "background", "required": false}]` stages library assets (or files under `harness/`) into every variant. `"logos": ["notion"]` fetches the brand's **official** mark via HyperFrames `media-use` (theSVG, CC0; no account needed). Assets are required unless marked otherwise.
- **In each variant:** files go to `assets/<kind>/`, listed in `assets/ASSETS.md` and `assets/assets.json`, under `## Assets` in `BRIEF.md`, and registered in `media-use`'s `.media/manifest.jsonl`.
- **Builders** get a *Your assets* section and the usage rules (`prompts/asset-usage.md`: logos are never redrawn, recolored, cropped or stretched; photos use cover-fit and camera moves on an inner wrapper; screenshots are shown as they are; Lottie is loaded with seek-safe settings). GLM/Gemini builders get `search_assets`, `use_asset` and `fetch_logo` tools; Claude and external builders get the same features over HTTP.
- **The `assets` gate (hard)** fails broken references, hotlinked media, files outside the project, unused required assets and stretched logos, and warns on other stretched images and on upscaled photos. Judges are told which brand assets must appear.
- **Photo search** through `media-use` needs the HeyGen CLI. Without it, photos come from the library, uploads, and site captures.

## API

| Method | Path | |
| --- | --- | --- |
| GET | `/health` | Chrome, ffmpeg, HyperFrames version, driver availability |
| GET | `/genres`, `/genres/:id` | Genre profiles with resolved seed axes |
| POST | `/gate` | `{projectDir, genre, browser?, only?}`: gate any HyperFrames project (workers' self-gate loop) |
| POST | `/runs` | `{genre, brief:{message, subject?, url?, length?, aspect?, audience?, style_preset?, intent?}, n?, builder?, judge?, judges?, builderModel?, judgeModel?, locks?}` |
| GET | `/runs`, `/runs/:id` | Run state |
| GET | `/runs/:id/events` | Server-sent events (`?format=json` for history) |
| GET | `/runs/:id/variants/:v/packet` | Latest worker packet, or the repair packet after a hard fail |
| POST | `/runs/:id/variants/:v/built` | External builder finished |
| POST | `/runs/:id/variants/:v/gate` | Re-gate after a manual fix |
| GET | `/runs/:id/variants/:v/gates` | Full gate report |
| GET | `/runs/:id/judge-packet?judge=j1` | Blind judge prompt |
| POST | `/runs/:id/scorecards` | Array of scorecards |
| GET | `/runs/:id/decision` | `DECISION.md` (or JSON with `accept: application/json`) |
| POST | `/runs/:id/advance`, `/reopen`, `/cancel`, `/render` | Lifecycle |
| GET | `/files/<runId>/<path>` | Snapshots, contact sheets, compare sheets |
| GET | `/play/<runId>/<variant>/` | A variant with the HyperFrames runtime injected, for `<hyperframes-player>` |
| GET | `/assets?q=&kind=&limit=` | Search the asset library |
| GET | `/assets/item?id=`, `/assets/file?id=` | One asset's metadata, or the file itself |
| POST | `/assets` | Upload `{filename, dataBase64, name?, kind?, tags?, description?, brand?, license?}` |
| POST | `/assets/reindex` | Re-scan `harness/assets` |
| POST | `/projects/assets/use` | `{projectDir, id, role?, required?}`: copy a library asset into a project |
| POST | `/projects/assets/logo` | `{projectDir, brand, role?}`: fetch an official logo into a project |

## Layout

```
src/server.ts            Express routes
src/runs/orchestrator.ts the run state machine (init → build → gate/repair → compare → judge → decide)
src/runs/seeds.ts        diverse, reproducible, memory-informed variant seeds
src/runs/decide.ts       scorecard validation and the winner decision
src/runs/packets.ts      fills prompts/*.md for workers, repairs, judges
src/gates/*.ts           duration, motion, determinism, density, ledger, check, seam, snapshot
src/score.ts             weighted, capped penalties; hard gates veto
src/drivers/*.ts         builder and judge drivers
src/llm/providers.ts     Z.ai, Gemini, DashScope, OpenAI-compatible profiles from .env
src/llm/agent.ts         provider-agnostic tool-using agent loop for builders
genres/*.json            per-genre bands, caps, check knobs, gate weights, seed axes, judge rubric
prompts/*.md             variant worker, repair round, blind judge
memory/lessons.jsonl     every judged variant, by seed (learning across runs)
runs/<id>/               run.json, events.jsonl, packets/, variants/<v>/ (HyperFrames projects), compare/, DECISION.md
.claude/skills/video-harness/SKILL.md   drive the server from Claude Code
```

## Notes

- **Pinned, vendored skills.** Workers read skills from `./hyperframes/skills` by absolute path and use `npx hyperframes@<vendored version>`. Variant `init` runs with `HYPERFRAMES_SKIP_SKILLS=1`, so a run never mutates the global skill set. Update with `git -C hyperframes pull`.
- **Seam gate on product launches is advisory.** `product-launch-video` injects push-slide, zoom-through, and crossfade transitions, which overlap scene wrappers by design, so the seam gate's zero-overlap rule fails on every cut. Direction and continuity findings still count, as warnings.
- **The seam gate runs a HyperFrames preview server**, and Studio stamps stable `data-hf-id` attributes into the project's HTML. The harness owns that server and Chrome's lifetime; the vendored script's own cleanup relies on POSIX process groups and leaks both on Windows.
- **Model defaults are the ones `agent/` already uses** (`glm-5.3-flash`, `gemini-3.1-flash-lite`). Flash-class models are cheap but weaker at long, tool-heavy workflows and at taste judgments; set stronger models for the builder and judge when quality matters most.
- Environment: `HARNESS_PORT`, `HARNESS_PUBLIC_URL`, `HARNESS_ENV_FILE`, `HARNESS_BUILDER`, `HARNESS_JUDGE`, `HARNESS_BUILDER_MODEL`, `HARNESS_JUDGE_MODEL`, `HARNESS_BUILDER_MAX_TURNS` (300), `HARNESS_AGENT_CONTEXT_CHARS`, `HARNESS_JUDGE_MAX_IMAGES` (20), `HARNESS_JUDGE_MAX_BYTES` (10 MB), `HARNESS_BASH`, `HARNESS_BROWSER_CONCURRENCY` (1), `HARNESS_BUILD_CONCURRENCY` (3), `HARNESS_CLAUDE_MODEL`, `HARNESS_BUILDER_EFFORT`, `HARNESS_BUILDER_MAX_USD`, `HF_ROOT`, `HF_HARNESS_RUNS`, `HF_HARNESS_MEMORY`.
