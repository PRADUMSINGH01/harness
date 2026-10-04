import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HF_HARNESS_RUNS = mkdtempSync(join(tmpdir(), "hf-runs-"));
const { catalog, getAsset, searchAssets, stageAsset, readStaged } = await import("../src/assets/catalog.ts");
const { readMeta } = await import("../src/assets/meta.ts");
const { assetTools } = await import("../src/assets/tools.ts");
const { loadProject } = await import("../src/project.ts");
const assetsGate = await import("../src/gates/assets.ts");
const { resolveAssetRequests } = await import("../src/runs/orchestrator.ts");

function project(body: string) {
  const dir = mkdtempSync(join(tmpdir(), "hf-assets-"));
  writeFileSync(join(dir, "hyperframes.json"), "{}");
  writeFileSync(join(dir, "index.html"), `<div id="root" data-composition-id="main" data-duration="5">${body}</div><script>window.__timelines["main"] = gsap.timeline({ paused: true });</script>`);
  return dir;
}
const codes = (dir: string) => assetsGate.run(loadProject(dir)).findings.map((f) => `${f.severity}:${f.code}`).sort();

test("the harness library is indexed from harness/assets with real sizes", () => {
  const all = catalog();
  assert.ok(all.length > 200, `${all.length} assets`);
  assert.ok(all.every((a) => a.path.replace(/\\/g, "/").includes("/harness/assets/")), "only the harness folder is read");
  const stripe = getAsset("official/stripe_official_logo");
  assert.equal(stripe?.kind, "logo");
  assert.equal(stripe?.brand, "stripe");
  assert.equal(stripe?.width, 200);
  assert.equal(getAsset("stripe_official_logo")?.kind, "logo", "sidecar ids work as aliases");
  const kinds = new Set(all.map((a) => a.kind));
  for (const k of ["logo", "photo", "illustration", "texture", "lottie"]) assert.ok(kinds.has(k as any), `has ${k}`);
});

test("file metadata comes from the bytes", () => {
  const jpg = catalog().find((a) => a.format === "jpg")!;
  const m = readMeta(jpg.path, "jpg");
  assert.ok(m.width! > 100 && m.height! > 100);
  assert.equal(m.transparent, false);
  const lottie = catalog().find((a) => a.kind === "lottie")!;
  assert.ok(lottie.durationSec! > 0);
});

test("search ranks by brand, name and tags, and filters by kind", () => {
  const hits = searchAssets("stripe logo", { kind: "logo", limit: 3 });
  assert.ok(hits.length && hits.every((h) => h.kind === "logo"));
  assert.equal(hits[0].brand, "stripe");
  assert.ok(searchAssets("loader", { kind: "lottie" }).length >= 1);
  assert.deepEqual(searchAssets("zzqx-nothing"), []);
});

test("staging copies into assets/<kind>/ and writes ASSETS.md + assets.json", () => {
  const dir = project("");
  const s = stageAsset(dir, getAsset("official/stripe_official_logo")!, { role: "end card", required: true });
  assert.equal(s.file, "assets/logo/stripe-official-logo.svg");
  assert.ok(readFileSync(join(dir, s.file), "utf8").includes("<svg"));
  assert.match(readFileSync(join(dir, "assets", "ASSETS.md"), "utf8"), /stripe-official-logo\.svg.*\*\*yes\*\*/);
  assert.equal(readStaged(dir)[0].required, true);
});

test("assets gate: required unused, hotlink, broken, outside, distorted logo, upscaled photo", () => {
  const unused = project("<p>hi</p>");
  stageAsset(unused, getAsset("official/stripe_official_logo")!, { required: true });
  assert.deepEqual(codes(unused), ["error:required-asset-unused"]);

  const good = project(`<img src="assets/logo/stripe-official-logo.svg" style="height:96px;width:auto">`);
  stageAsset(good, getAsset("official/stripe_official_logo")!, { required: true });
  assert.deepEqual(codes(good), []);

  const bad = project(
    `<img src="https://example.com/x.png"><img src="assets/missing.png"><img src="../../secret.png">` +
      `<img src="assets/logo/stripe-official-logo.svg" width="400" height="100">` +
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">`,
  );
  stageAsset(bad, getAsset("official/stripe_official_logo")!);
  assert.deepEqual(codes(bad), ["error:broken-asset", "error:distorted-asset", "error:hotlinked-media", "error:outside-project"]);

  const photo = catalog().find((a) => a.format === "jpg" && a.width && a.width < 1500)!;
  const up = project(`<img src="assets/${photo.kind}/PLACEHOLDER" style="width:${Math.round(photo.width! * 2)}px">`);
  const staged = stageAsset(up, photo);
  writeFileSync(join(up, "index.html"), readFileSync(join(up, "index.html"), "utf8").replace(`assets/${photo.kind}/PLACEHOLDER`, staged.file));
  assert.ok(codes(up).includes("warning:upscaled-raster"));
});

test("brief asset requests are validated before a run starts", () => {
  const ok = resolveAssetRequests({ message: "m", assets: ["official/stripe_official_logo", { id: "paper/paper-grain-texture", role: "background", required: false }], logos: ["notion"] });
  assert.deepEqual(
    ok.map((a) => `${a.source}:${a.ref}:${a.required}`),
    ["library:official/stripe_official_logo:true", "library:paper/paper-grain-texture:false", "logo:notion:true"],
  );
  assert.throws(() => resolveAssetRequests({ message: "m", assets: ["no/such-asset"] }), /unknown asset/);
  const outside = join(tmpdir(), "outside.png");
  writeFileSync(outside, "x");
  assert.throws(() => resolveAssetRequests({ message: "m", assets: [{ path: outside }] }), /outside the harness/);
});

test("agent tools search and stage assets into the project", async () => {
  const dir = project("");
  mkdirSync(join(dir, "assets"), { recursive: true });
  const tools = Object.fromEntries(assetTools(dir).map((t) => [(t.tool as any).function.name, t.run]));
  assert.match(String(await tools.search_assets({ query: "paper texture", kind: "texture" })), /\[texture\]/);
  const used = JSON.parse(String(await tools.use_asset({ id: "paper/paper-grain-texture", role: "background" })));
  assert.equal(used.kind, "texture");
  assert.match(used.snippet, /background-image:url\('assets\/texture\//);
  assert.match(String(await tools.search_assets({ query: "zzqx-nothing" })), /fetch_logo/);
});

test("creative kit: 200+ themeable SVGs indexed under their own kinds", () => {
  const kit = catalog().filter((a) => a.path.replace(/\\/g, "/").includes("/assets/creative/"));
  assert.ok(kit.length >= 200, `${kit.length} creative assets`);
  const kinds = new Set(kit.map((a) => a.kind));
  for (const k of ["background", "overlay", "shape", "doodle", "mockup", "chart", "title", "matte", "frame", "icon"]) assert.ok(kinds.has(k as any), `has ${k}`);
  assert.ok(kit.every((a) => a.format === "svg" && a.width && a.height && a.description), "every kit asset has a size and a description");
  assert.ok(!kit.some((a) => a.kind === "logo"), "nothing in the kit is mistaken for a logo");
  const doodle = getAsset("doodles/underline-swoosh")!;
  assert.equal(doodle.kind, "doodle");
  assert.match(doodle.usage.entrance ?? "", /draw-on/);
  assert.equal(searchAssets("underline doodle", { kind: "doodle" })[0].id.startsWith("doodles/underline"), true);
  assert.equal(searchAssets("film grain")[0].id, "overlays/film-grain");
  assert.equal(searchAssets("lower third")[0].kind, "title");
});

test("use_asset returns inline markup for creative SVGs, themeable through CSS variables", async () => {
  const dir = project("");
  const tools = assetTools(dir);
  const use = tools.find((t) => (t.tool as any).function.name === "use_asset")!;
  const out = JSON.parse(await use.run({ id: "doodles/circle-scribble", role: "circle the hero word" }));
  assert.equal(out.file, "assets/doodle/circle-scribble.svg");
  assert.match(out.inline, /^<svg [^>]*viewBox="0 0 600 300"/);
  assert.match(out.inline, /class="draw"[^>]*pathLength="1"/);
  assert.match(out.inline, /var\(--accent,#FF5A36\)/);
  const bg = JSON.parse(await use.run({ id: "backgrounds/starfield" }));
  assert.equal(bg.inline, undefined, "large SVGs are placed by file, not inlined");
  assert.match(bg.snippet, /object-fit:cover/);
  const logo = JSON.parse(await use.run({ id: "official/stripe_official_logo" }));
  assert.equal(logo.inline, undefined, "logos are never handed out for inlining");
});
