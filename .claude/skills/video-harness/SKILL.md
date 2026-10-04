---
name: video-harness
description: >
  Make the best possible short video, motion graphic, or product launch video by running a best-of-N
  through the hf-harness server around the vendored HyperFrames skills: several seeded variants are
  built in parallel, gated (doctrine, determinism, density, seams, HyperFrames check), judged blind from
  proof frames, and the winner is picked. Use when the user wants a top-quality video and accepts N
  builds of cost, or asks to use the harness, run variants, or compare takes.
---

# video-harness

The server in this folder (`src/server.ts`) owns runs, gates, scoring, judging and the decision. This skill makes a Claude Code session its **external builder and judge**. All state lives on the server; read it from there instead of remembering it.

## 0. Server up

```bash
curl -s localhost:8100/health
```

If that fails, start it in the background with `npm run server` from this folder, then re-check. Read `/health`: it says whether Chrome is present (required), whether ffmpeg is present (render only), and which builder/judge drivers are available.

## 1. Brief and genre

Pick the genre from the deliverable, never from a passing word:

| Deliverable | `genre` | Workflow it drives |
| --- | --- | --- |
| Short, unnarrated, motion-first unit (stat hit, kinetic type, logo sting, chart, lower third), usually under 10s | `motion-graphics` | `motion-graphics` |
| Market or showcase a product, app, site, or company (URL, script, or brief) | `product-launch` | `product-launch-video` |
| Any other short multi-scene film (social short, explainer short, sizzle) | `short-video` | `general-video` |

**Assets:** if the user names a brand, product or partner, put official logos in `brief.logos` (e.g. `["stripe"]`) and library assets in `brief.assets` (find them with `curl -s "localhost:8100/assets?q=..."` or the dashboard's asset browser). For the user's own files, upload them first (`POST /assets`) or have them placed under `harness/`. Everything listed is staged into every variant and is required unless marked `"required": false`.

The brief needs `message` (the one thing the video must communicate). Ask for it in one question if it is missing. Fill `length`, `aspect`, `audience`, `url`, and `subject` from what the user said; don't interrogate. `GET /genres` lists each genre's seed axes, and the user may lock any of them (`locks: {"frame_preset": "coral"}`).

## 2. Start the run

```bash
curl -s -X POST localhost:8100/runs -H "content-type: application/json" -d '{"genre":"product-launch","n":3,"builder":"external","judge":"external","judges":2,"brief":{"message":"...","url":"https://...","length":"45s","aspect":"1920x1080"}}'
```

- `n` defaults per genre (motion graphics 4, others 3). Every variant is a full workflow build, so say the cost in one line before starting more than the default.
- `builder: "zai" | "gemini" | "dashscope" | "openai" | "claude-agent"` makes the server build variants itself with that provider (keys in `harness/.env`; `/health` shows which are ready). With `external`, you build (step 3).
- `judge: "gemini" | "zai" | ... | "claude-agent"` makes the server judge. Prefer a different provider than the builder. With `external`, you judge (step 5).
- `builderModel` / `judgeModel` override the provider's default model for this run.

Show the user the run id and the dashboard: `http://localhost:8100/ui#<run-id>`.

## 3. Build (external builder)

Poll `GET /runs/<id>` until every variant is `waiting-build`. Then dispatch **one sub-agent per variant, all in one wave**. Each sub-agent's whole prompt is the packet:

```bash
curl -s localhost:8100/runs/<id>/variants/<v>/packet
```

The packet tells the worker everything: the workflow skill to follow, the doctrine, its binding seed, the self-gate loop, and the `POST .../built` call that ends its job. Don't add instructions of your own, and don't tell a worker about the other variants' seeds.

When workers return, check `GET /runs/<id>`. A variant that went back to `waiting-build` after gating failed a hard gate: its packet endpoint now returns the **repair** packet. Dispatch a new worker with that packet. The server stops offering repairs after the genre's `repairRounds`.

## 4. Gates and compare (server)

The server gates each built variant (static gates, then `hyperframes check`, the numeric seam gate, and proof snapshots), then renders side-by-side compare sheets. Nothing to do but watch `GET /runs/<id>/events?format=json`. Report hard failures plainly; a vetoed variant is not "almost good".

## 5. Judge (external judge)

When the run is `waiting-judges`, dispatch **one fresh sub-agent per judge** (`j1`, `j2`, ...). A judge must not be a builder: never reuse a worker, and never judge yourself if you built or read a variant's files. Each judge's prompt is exactly:

```bash
curl -s "localhost:8100/runs/<id>/judge-packet?judge=j1"
```

plus one line: "Read every image path listed under Materials, then POST your JSON array to http://localhost:8100/runs/<id>/scorecards. If the response is 422, fix the listed errors and POST again."

## 6. Decision and handoff

```bash
curl -s -H "accept: text/markdown" localhost:8100/runs/<id>/decision
```

Give the user: the winner's directory, its contact sheet (`<dir>/.harness/snapshots/contact-sheet.jpg`), the ranking with final/technical/judge scores, and the winner's top judge fixes. Offer exactly one next step:

- **Polish:** apply the winner's judge fixes in place, then `POST /runs/<id>/variants/<v>/gate` and confirm the technical score did not drop.
- **Render:** `POST /runs/<id>/render`. Without ffmpeg the server returns 409 with the command to run elsewhere. Say so, and don't claim a render happened.

Every decided run is appended to `memory/lessons.jsonl`; later runs seed one variant from the axis values that have won for that genre.
