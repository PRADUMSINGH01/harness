# Repair round {{ROUND}} of {{MAX_ROUNDS}}: {{RUN_ID}} / {{VARIANT_ID}}

The harness gates rejected this build of `{{PROJECT_DIR}}`. Technical score: **{{TECHNICAL}}/100**, hard fail: **{{HARD_FAIL}}**. A hard-failed variant is vetoed from the best-of-N, however good it looks.

Your original instructions in `{{PACKET_PATH}}` still apply, but do not re-read that file: the findings below, with their `fix` hints, are all you need. Fix this build in place, editing only what a finding names. The CLI is `{{HF_CLI}}`.

## Findings (errors first)

{{FINDINGS}}

## How to repair

- Fix every **error**. Then fix any warning a viewer would notice.
- Make the cheapest safe edit that removes the defect at its source. Never change a fixed duration, cut a scene, or delete content just to silence a gate.
- `idle-wobble`: replace the loop with a sustained-motion route (staged reveal, camera with intent, sequenced UI life, animated sequence, cursor-led action). Don't just delete it and leave the phase frozen.
- `vector-mismatch` / `ping-pong`: fix the **plan** in `ledger.json` first, then make the motion match it.
- `check.*` findings include a `fix` hint from HyperFrames itself. Follow it.
- Rerun the self-gate until `hardFail` is false. Use the static pass (`"browser": false`, a few seconds, includes HyperFrames lint) while you edit, then one quick browser pass to confirm:
  ```bash
  curl -s -X POST {{SERVER}}/gate -H "content-type: application/json" -d '{"projectDir": "{{PROJECT_DIR_JSON}}", "genre": "{{GENRE}}", "browser": false}'
  curl -s -X POST {{SERVER}}/gate -H "content-type: application/json" -d '{"projectDir": "{{PROJECT_DIR_JSON}}", "genre": "{{GENRE}}", "browser": true, "quick": true}'
  ```
- Add a `## Repair {{ROUND}}` section to `NOTES.md` saying what you changed. Then {{DONE_INSTRUCTION}}
