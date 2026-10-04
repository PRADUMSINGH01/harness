import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HF_HARNESS_QUICK = mkdtempSync(join(tmpdir(), "hf-quick-"));
const { TEMPLATES } = await import("../src/templates/library.ts");
const { contrast } = await import("../src/templates/kit.ts");
const { numberAppears } = await import("../src/templates/quick.ts");

const spec = (aspect: "16:9" | "9:16", overrides: Record<string, unknown> = {}) => ({
  aspect,
  brand: { name: "Acme", url: "acme.test", font: "Geist", fontImport: "https://fonts.googleapis.com/css2?family=Geist&display=block", logo: "assets/logo.png" },
  palette: { bg: "#171914", surface: "#292D25", ink: "#F1EADF", muted: "#B8B5A8", accent: "#CF795D", accent2: "#00D492" },
  copy: {
    kicker: "Motion AI",
    headline: "Give ideas a *moving* form",
    subline: "From brief to render",
    features: [
      { title: "Direct", icon: "wand" },
      { title: "Shape", icon: "not-an-icon" },
      { title: "Ship", icon: "rocket" },
    ],
    stat: { value: 99.98, suffix: "%", label: "uptime" },
    callout: "Studio",
    cta: "Start creating",
  },
  media: { screenshot: "assets/screenshot.png" },
  style: { background: "aurora-mesh", transition: "iris", grain: true },
  ...overrides,
});

test("every template builds a complete, timeline-registered film in both aspects", () => {
  for (const t of TEMPLATES) {
    for (const aspect of ["16:9", "9:16"] as const) {
      const html = t.build(spec(aspect) as any).html;
      const [W, H] = aspect === "9:16" ? [1080, 1920] : [1920, 1080];
      assert.match(html, new RegExp(`data-width="${W}" data-height="${H}"`), `${t.id} ${aspect} canvas`);
      assert.match(html, /window\.__timelines\["main"\] = tl;/, `${t.id} registers its timeline`);
      assert.match(html, /@import url\('https:\/\/fonts\.googleapis\.com/, `${t.id} declares the brand font`);
      assert.match(html, /id="lockup"[\s\S]*assets\/logo\.png/, `${t.id} ends on the logo lockup`);
      assert.doesNotMatch(html, /undefined|NaN|\[object/, `${t.id} ${aspect} has no unfilled values`);
      assert.doesNotMatch(html, /repeat:\s*-1|yoyo/, `${t.id} never loops`);
      const eases = new Set([...html.matchAll(/ease: (\w+)/g)].map((m) => m[1]));
      assert.ok(eases.size <= 4, `${t.id} uses at most four eases: ${[...eases].join(",")}`);
    }
  }
});

test("the stat template only runs with a stat; unknown icons fall back to the set", () => {
  const stat = TEMPLATES.find((t) => t.id === "stat-punch")!;
  assert.deepEqual(stat.needs, ["stat"]);
  const html = TEMPLATES.find((t) => t.id === "feature-grid")!.build(spec("16:9") as any).html;
  assert.match(html, /aria-label="Sparkles \(AI\)"/, "an unknown icon id becomes the sparkles icon");
});

test("accent text falls back to ink when it would not read on the ground", () => {
  assert.ok(contrast("#000000", "#FFFFFF") > 20);
  const bold = TEMPLATES[0].build(spec("16:9", { style: { background: "grainy-gradient", transition: "iris", grain: false } }) as any).html;
  assert.match(bold, /--accent-text: #F1EADF/);
  const calm = TEMPLATES[0].build(spec("16:9") as any).html;
  assert.match(calm, /--accent-text: #CF795D/);
});

test("a stat survives only if its number is in the source text", () => {
  const source = "99.98% GPU Cluster Uptime. Over 1,200 creators. 10x faster.";
  assert.ok(numberAppears(99.98, source));
  assert.ok(numberAppears(1200, source), "thousands separators match");
  assert.ok(numberAppears(10, source));
  assert.ok(!numberAppears(60, source), "an invented 60 is rejected");
  assert.ok(!numberAppears(9, source), "9 is not a prefix match of 99.98");
  assert.ok(!numberAppears(98, source), "98 is not a suffix match of 99.98");
});

test("a stat must be a quantity, never an id, version or year", async () => {
  const { isQuantity } = await import("../src/templates/quick.ts");
  assert.ok(isQuantity({ value: 99.98, suffix: "%" }));
  assert.ok(isQuantity({ value: 10, suffix: "x" }));
  assert.ok(isQuantity({ value: 29, prefix: "$" }));
  assert.ok(isQuantity({ value: 1200, suffix: "+" }));
  assert.ok(!isQuantity({ value: 8852, prefix: "DRV-" }), "an issue id");
  assert.ok(!isQuantity({ value: 2024 }), "a year");
  assert.ok(!isQuantity({ value: 3, prefix: "v" }), "a version");
});
