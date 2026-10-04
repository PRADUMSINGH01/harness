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

## Website trailers in about two minutes

Open **http://localhost:8100/launch**, paste a landing page, choose landscape (16:9), vertical (9:16) or both, and press **Make the trailer**. The page refreshes itself until the videos are ready, then plays them with their quality score and a **Render MP4** link.

What happens (`mode: "trailer"`):

1. **Clone** (`src/launch/clone.ts`, cached per URL in `quick/_sites/`): Chrome opens the page, scrolls every component into view so scroll-reveal animations finish, and copies it as code: computed styles inlined, headings split into maskable words, numbers marked for count-ups, buttons marked as cursor targets, images and fonts downloaded, WebGL canvases kept as rasters. Each part keeps the ground the site paints behind it. Parts: logo, headline, subline, buttons, header, hero, feature cards, the four most visual sections (each with its title and its hero visual), the customer-logo strip, pricing.
2. **Trailer** (`src/launch/trailer.ts`): logo sting, the real headline with a cursor click on the real button, a 3D flyover of the page, the feature cards, feature beats (title and visual land from depth, then the camera dives into one real card until its copy fills the frame; wide strips pan at reading size), social proof, pricing, an end card. Whip and zoom seams; `ledger.json` written to match; never over 60 seconds.
3. **Gates** as a product launch: lint, runtime, layout, contrast, motion, and a proof frame per scene.

A fresh site takes about 1 minute to clone and 1 minute to gate; a cloned site skips the first minute. Sites that block automated browsers can't be cloned.

Other modes on the same endpoint: `mode: "launch"` builds a launch film from the captured page structure and screenshots (`src/launch/extract.ts`, `film.ts`); the default `mode: "templates"` makes four 10-second template films (`src/templates/library.ts`).

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

### With Docker (recommended for deploying)

```bash
cp .env.example .env        # add ZAI_API_KEY (and any other provider keys)
docker compose up -d --build
```

Then open **http://localhost:8100/launch** (videos) or **http://localhost:8100/docs** (API). The image carries everything: Node 24, HyperFrames' pinned `chrome-headless-shell`, FFmpeg (so MP4 render works), fonts, and the slice of the vendored HyperFrames the harness reads. Videos, site clones, memory and uploads live in Docker volumes (`runs`, `quick`, `memory`, `uploads`) and survive rebuilds.

| Setting (in `.env`) | |
| --- | --- |
| `HARNESS_API_KEY` | Require a key on every route except `/health` and `/docs`. Machines send `x-api-key: <key>` or `Authorization: Bearer <key>`; in a browser open any page once with `?key=<key>` (stored as a cookie). |
| `HARNESS_PUBLIC_URL` | The address clients use (e.g. `https://video.example.com`); player, frame and download links are built from it. |
| `HARNESS_HOST_PORT` | Host port (default 8100). |

Operations: `docker compose logs -f`, `docker compose restart`, `docker compose down` (volumes kept; add `-v` to delete them). Chrome needs memory: give Docker at least 4 GB for comfortable gating (Docker Desktop → Settings → Resources).

### Without Docker

```bash
npm install
npm run server          # http://localhost:8100, launch page at /launch, API docs at /docs
npm test                # unit tests for gates, seeding, judging, decisions, API coverage
npm run typecheck
```

Requirements: Node 22 or newer and Chrome, which HyperFrames finds via `npx hyperframes browser path`. The HyperFrames CLI is a pinned dependency (`node_modules/hyperframes`), so nothing runs through `npx` at request time. **FFmpeg is needed only for MP4 output** (`winget install --id Gyan.FFmpeg -e` on Windows): without it every gate, snapshot and the player still work, and the render endpoints return 409 with that command.

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
- **Long runs:** old tool output is elided once the transcript passes `HARNESS_AGENT_CONTEXT_CHARS` (default 400k characters).

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

Every function has an HTTP route. The full, interactive reference is **`/docs`** (Swagger UI) and the machine-readable one is **`/openapi.json`**; `test/api.test.ts` fails if a route is added without documenting it.

**Make a website trailer, wait for it, download the MP4:**

```bash
curl -X POST localhost:8100/quick -H "content-type: application/json" -d '{"url":"https://resend.com","mode":"trailer","aspects":["16:9","9:16"]}'
curl localhost:8100/quick/<id>                                   # poll until "status": "done"
curl -X POST localhost:8100/quick/<id>/render -H "content-type: application/json" -d '{"template":"trailer-landscape"}'
curl -OJ localhost:8100/quick/<id>/download/trailer-landscape    # once the render is done
```

| Area | Routes |
| --- | --- |
| Website trailers | `POST /quick` {url, mode: trailer\|launch\|templates, aspects?, brief?} → 202 {id}; `GET /quick`; `GET /quick/:id`; `DELETE /quick/:id`; `POST /quick/:id/render` {template}; `GET /quick/:id/download/:template`; `GET /quick-view/:id` (watch); `GET /quick-play/:id/:t/` (player source); `POST /frames` {at:[s], quickId+template \| projectDir} (still frames) |
| Sites (code clones) | `POST /sites` {url, refresh?}; `GET /sites`; `GET /sites/:site`; `GET /sites/:site/preview`; `GET /sites/:site/parts/:name` (?format=json); `GET /sites/:site/clone/<file>`; `DELETE /sites/:site` |
| Page analysis | `POST /capture` {url} (screenshots, HTML, fonts, logos); `GET /captures/:site/<file>`; `POST /brandkit` {url}; `POST /extract` {url} (navbar, hero, features, pricing as data) |
| Runs (agent best-of-N) | `POST /runs` {genre, brief:{message, ...}, n?, builder?, judge?, ...}; `GET /runs`; `GET /runs/:id`; `GET /runs/:id/events` (SSE); `GET\|POST /runs/:id/variants/:v/...` (packet, built, gate, gates, agent-log); `GET /runs/:id/judge-packet`; `GET /runs/:id/judge-log/:judge`; `POST /runs/:id/scorecards`; `GET /runs/:id/decision`; `POST /runs/:id/advance\|reopen\|pause\|resume\|cancel\|render`; `GET /files/<runId>/<path>`; `GET /play/<runId>/<variant>/` |
| Gates | `POST /gate` {projectDir, genre, browser?, only?, quick?}; `GET /gates` |
| Assets | `GET /assets` (?q, kind, limit); `GET /assets/item`, `/assets/file` (?id); `POST /assets` {filename, dataBase64, ...}; `POST /assets/reindex`; `POST /projects/assets/use`; `POST /projects/assets/logo` |
| System | `GET /health`; `GET /providers`; `GET /templates`; `GET /genres`, `/genres/:id`; `GET /memory`; `GET /ui`; `GET /launch`; `GET /docs`; `GET /openapi.json` |

Project paths in request bodies (`projectDir`, `fromPath`) must sit inside the harness data folders (`runs/`, `quick/`), so a deployed server can't be pointed at other files on its host.

## Layout

```
src/server.ts            Express routes (runs, gates, assets, quick jobs, pages)
src/api.ts               sites, captures, brand kits, frames, catalogs, the API key, /docs
src/openapi.ts           the OpenAPI document (one table of every route)
src/launch/clone.ts      landing page → components cloned as code
src/launch/trailer.ts    cloned components → website trailer
Dockerfile, docker-compose.yml, docker/   the container image and its entrypoint
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
- Environment: `HARNESS_PORT`, `HARNESS_PUBLIC_URL`, `HARNESS_API_KEY`, `HARNESS_ENV_FILE`, `HARNESS_BUILDER`, `HARNESS_JUDGE`, `HARNESS_BUILDER_MODEL`, `HARNESS_JUDGE_MODEL`, `HARNESS_BUILDER_MAX_TURNS` (300), `HARNESS_AGENT_CONTEXT_CHARS`, `HARNESS_JUDGE_MAX_IMAGES` (20), `HARNESS_JUDGE_MAX_BYTES` (10 MB), `HARNESS_BASH`, `HARNESS_BROWSER_CONCURRENCY` (1), `HARNESS_BUILD_CONCURRENCY` (3), `HARNESS_CLAUDE_MODEL`, `HARNESS_BUILDER_EFFORT`, `HARNESS_BUILDER_MAX_USD`, `HF_ROOT`, `HF_HARNESS_RUNS`, `HF_HARNESS_MEMORY`.
