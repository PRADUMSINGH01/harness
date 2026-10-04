import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject, type Project } from "../src/project.ts";
import { getGenre } from "../src/genres.ts";
import * as motion from "../src/gates/motion.ts";
import * as determinism from "../src/gates/determinism.ts";
import * as density from "../src/gates/density.ts";
import * as ledger from "../src/gates/ledger.ts";
import * as duration from "../src/gates/duration.ts";
import { scoreGates } from "../src/score.ts";

const fixtures = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");

// Static gates read the timeline from the project; set it directly so tests never spawn the CLI.
function load(name: string, seconds: number): Project {
  const p = loadProject(join(fixtures, name));
  p.timeline = { duration: seconds, tracks: [] };
  return p;
}

const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code).sort();

test("clean motion graphic passes every static gate", () => {
  const p = load("good-mg", 6);
  const g = getGenre("motion-graphics");
  for (const gate of [motion, determinism, density, ledger, duration]) {
    const r = gate.run(p, g);
    assert.deepEqual(r.findings.filter((f) => f.severity === "error"), [], `${gate.id}: ${JSON.stringify(r.findings)}`);
  }
  assert.equal((motion.run(p, g).data as any).tweenCount, 6, "chained .fromTo/.to calls are all counted");
});

test("motion gate catches idle wobble, forbidden ease, slow entry, CSS idle loop; ignores comments", () => {
  const r = motion.run(load("bad-short", 20), getGenre("short-video"));
  const c = codes(r);
  assert.equal(c.filter((x) => x === "idle-wobble").length, 2, "yoyo tween + glow-pulse CSS loop, not the commented one");
  assert.ok(c.includes("forbidden-ease"));
  assert.ok(c.includes("slow-entry"));
});

test("determinism gate catches Math.random and Date.now", () => {
  const c = codes(determinism.run(load("bad-short", 20)));
  assert.ok(c.includes("unseeded-random"));
  assert.ok(c.includes("wall-clock"));
});

test("density gate flags long blocks and small type", () => {
  const c = codes(density.run(load("bad-short", 20), getGenre("short-video")));
  assert.ok(c.includes("long-block"));
  assert.ok(c.includes("small-type"));
});

test("ledger gate catches mismatch, ping-pong, and a cut past the end", () => {
  const c = codes(ledger.run(load("bad-short", 20), getGenre("short-video")));
  assert.ok(c.includes("vector-mismatch"), "a→b exits LEFT, enters RIGHT");
  assert.ok(c.includes("ping-pong"), "b→c RIGHT then c→d LEFT");
  assert.ok(c.includes("ledger-range"), "cut 25s on a 20s film");
});

test("ledger gate requires a ledger for multi-scene films", () => {
  const p = load("bad-short", 20);
  p.ledger = null;
  const r = ledger.run(p, getGenre("short-video"));
  assert.ok(codes(r).includes("no-ledger"));
});

test("duration gate checks the genre band and the brief length", () => {
  const p = load("bad-short", 20);
  const c = codes(duration.run(p, getGenre("short-video")));
  assert.ok(c.includes("off-brief"), "20s vs brief 45s");
  assert.ok(!c.includes("out-of-band"));
  assert.ok(codes(duration.run(load("good-mg", 45), getGenre("motion-graphics"))).includes("out-of-band"));
});

test("hard gates veto; penalties are capped per gate", () => {
  const p = load("bad-short", 20);
  const g = getGenre("short-video");
  const gates = Object.fromEntries([motion, determinism, density, ledger, duration].map((x) => [x.id, x.run(p, g)]));
  const s = scoreGates(gates, g);
  assert.equal(s.hardFail, true);
  assert.ok(s.penalties.motion <= g.gates.motion.cap!);
  assert.ok(s.technical >= 0 && s.technical < 50, `technical ${s.technical}`);
  const good = load("good-mg", 6);
  const mg = getGenre("motion-graphics");
  const clean = scoreGates(Object.fromEntries([motion, determinism, density, ledger, duration].map((x) => [x.id, x.run(good, mg)])), mg);
  assert.equal(clean.hardFail, false);
  assert.equal(clean.technical, 100);
});

test("check args put the project dir first and give --frame-check an explicit value", async () => {
  const { checkArgs } = await import("../src/gates/check.ts");
  const args = checkArgs(load("good-mg", 6), getGenre("motion-graphics"));
  assert.equal(args[1], ".", "a bare --frame-check would swallow a trailing '.'");
  assert.ok(args.includes("--frame-check=severity=warning"));
  assert.ok(!args.includes("--frame-check"));
});

test("entry gate fails a blank init template and unmounted compositions", async () => {
  const entry = await import("../src/gates/entry.ts");
  const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "hf-entry-"));
  writeFileSync(join(dir, "hyperframes.json"), "{}");
  writeFileSync(
    join(dir, "index.html"),
    `<div id="root" data-composition-id="main" data-duration="10"><h1 id="title" class="clip" data-start="0" data-duration="10">Title</h1></div><script>const tl = gsap.timeline({ paused: true });\n// Example: tl.fromTo("#title", {}, {}, 0);\nwindow.__timelines["main"] = tl;</script>`,
  );
  mkdirSync(join(dir, "compositions"));
  writeFileSync(join(dir, "compositions", "index.html"), "<div data-composition-id='film'></div>");
  const r = entry.run(loadProject(dir));
  assert.deepEqual(r.findings.map((f) => `${f.severity}:${f.code}`).sort(), ["error:blank-entry", "error:unmounted"]);
  assert.deepEqual(entry.run(load("good-mg", 6)).findings, []);
});

test("identical proof frames are a static film", async () => {
  const { frozenFindings } = await import("../src/gates/snapshot.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "hf-frozen-"));
  for (const n of ["a", "b", "c"]) writeFileSync(join(dir, `${n}.png`), "same");
  writeFileSync(join(dir, "d.png"), "different");
  assert.equal(frozenFindings(dir, ["a.png", "b.png", "c.png"], [1, 2, 3])[0]?.code, "static-film");
  assert.equal(frozenFindings(dir, ["a.png", "b.png", "c.png", "d.png"], [1, 2, 3, 4])[0]?.code, "mostly-static");
  assert.deepEqual(frozenFindings(dir, ["a.png", "d.png", "a.png"], [1, 2, 3]), []);
});
