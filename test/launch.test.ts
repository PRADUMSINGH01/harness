import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.HF_HARNESS_QUICK = mkdtempSync(join(tmpdir(), "hf-quick-"));
const { buildFilm } = await import("../src/launch/film.ts");

const input = (overrides: Record<string, unknown> = {}) => ({
  aspect: "16:9" as const,
  brand: { name: "Acme", url: "acme.test", font: "Inter", logo: "assets/logo.png" },
  palette: { bg: "#111216", surface: "#1E2027", ink: "#F5F3EE", muted: "#A0A4AC", accent: "#FF5A36", accent2: "#7B61FF" },
  copy: {
    kicker: "Video AI",
    headline: "Ship *launch* films fast",
    subline: "From link to film",
    features: [
      { title: "Capture", icon: "globe" },
      { title: "Compose", icon: "layers" },
      { title: "Render", icon: "film" },
    ],
    stat: { value: 99.9, suffix: "%", label: "uptime" },
    callout: "Studio",
    cta: "Start free",
  },
  parts: {
    nav: ["Product", "Pricing", "Docs"],
    headerCta: "Sign up",
    hero: { headline: "The launch video studio for every team", subline: "Turn any landing page into a film.", ctas: ["Start free", "Book a demo"] },
    features: [
      { title: "Real UI", text: "Rebuilt from the page itself.", icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" fill="currentColor"/></svg>' },
      { title: "Real icons", text: "The site's own SVG marks." },
      { title: "Real prices", text: "Counted up from the pricing page." },
    ],
    plans: [
      { name: "Free", price: "Free", amount: 0, features: ["1 film"], featured: false },
      { name: "Pro", price: "$29", amount: 29, period: "/mo", features: ["Unlimited films", "4K"], featured: true },
    ],
    version: 1,
  },
  media: { screenshot: "assets/screenshot.png" },
  style: { background: "aurora-mesh", grain: false },
  ...overrides,
});

test("a launch film is a root plus one sub-composition per scene, under 60 seconds", () => {
  const film = buildFilm(input() as any);
  assert.ok(film.duration > 20 && film.duration <= 60, `${film.duration}s`);
  const labels = film.scenes.map((s) => s.label);
  assert.deepEqual(labels, ["Site opener", "Statement", "Features", "Product tour", "Stat", "Pricing", "Call to action"]);
  const root = film.files["index.html"];
  for (const s of film.scenes) {
    const sub = film.files[`compositions/${s.id}.html`];
    assert.ok(sub, `${s.id} has its own file`);
    assert.match(root, new RegExp(`data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html"`), `${s.id} is mounted with matching ids`);
    assert.match(sub, new RegExp(`<template>[\\s\\S]*data-composition-id="${s.id}"[\\s\\S]*window.__timelines\\["${s.id}"\\] = tl;[\\s\\S]*</template>`), `${s.id} registers inside its template`);
    assert.doesNotMatch(sub, /\.\.\/assets\//, `${s.id} uses root-relative asset paths`);
    assert.doesNotMatch(sub, /undefined|NaN|\[object/, `${s.id} has no unfilled values`);
  }
  assert.match(film.files["compositions/s-pricing.html"], /data-to="29" data-prefix="\$"/, "prices count up from the real amount");
  assert.match(film.files["compositions/s-pricing.html"], />Free</, "a free plan shows its word, not a count");
});

test("the ledger has one row per cut: push-slide LEFT, then a zoom-through into the CTA", () => {
  const film = buildFilm(input() as any);
  const seams = (film.ledger as any).seams;
  assert.equal(seams.length, film.scenes.length - 1);
  for (const s of seams.slice(0, -1)) assert.deepEqual([s.exit.axis, s.exit.dir, s.entry.axis, s.entry.dir], ["x", -1, "x", -1]);
  assert.deepEqual([seams.at(-1).exit.axis, seams.at(-1).entry.dir], ["z", 1]);
  assert.deepEqual(seams.map((s: any) => s.cut), film.scenes.slice(1).map((s) => s.start));
});

test("scenes come and go with the content: no stat, no pricing, a repeated statement", () => {
  const base = input() as any;
  const film = buildFilm({ ...base, copy: { ...base.copy, stat: undefined, headline: "The *launch* video studio for every team" }, parts: { ...base.parts, plans: [] } });
  const labels = film.scenes.map((s) => s.label);
  assert.ok(!labels.includes("Stat") && !labels.includes("Pricing"), labels.join(","));
  assert.ok(!labels.includes("Statement"), "a statement that repeats the hero headline is dropped");
  const vertical = buildFilm({ ...base, aspect: "9:16" });
  assert.match(vertical.files["index.html"], /data-width="1080" data-height="1920"/);
  assert.doesNotMatch(vertical.files["compositions/s-hero.html"], /class="nl"/, "the vertical opener drops the navbar");
});

test("trimmed lines end on a complete thought, and badges are not buttons", async () => {
  const { clip, isCta } = await import("../src/launch/film.ts");
  assert.equal(clip("Automatically turn conversations and customer feedback into actionable issues that are instantly routed, labeled, and prioritized.", 12), "Automatically turn conversations and customer feedback into actionable issues");
  assert.equal(clip("byreel turns a creative brief into precise motion graphics — from first direction to final render.", 13), "byreel turns a creative brief into precise motion graphics");
  assert.equal(clip("Plan and navigate from idea to launch.", 12), "Plan and navigate from idea to launch.");
  assert.ok(isCta("Start creating") && isCta("Book a demo") && isCta("Open app"));
  assert.ok(!isCta("New Loops →") && !isCta("Customers"));
});
