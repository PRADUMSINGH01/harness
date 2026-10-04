import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brandKitNote, brandSlug, ensureBrandKit, readBrandKit } from "../src/runs/brandkit.ts";

test("brand kit: auto-resolved fonts need no network, and the kit is written once", async () => {
  const cap = mkdtempSync(join(tmpdir(), "hf-cap-"));
  mkdirSync(join(cap, "extracted"), { recursive: true });
  writeFileSync(join(cap, "extracted", "tokens.json"), JSON.stringify({ fonts: [{ family: "Inter", weights: [400, 700] }, { family: "Helvetica Neue" }] }));
  writeFileSync(join(cap, "extracted", "page.html"), "<html><body><img alt='hero' src='data:image/png;base64,AAAA'></body></html>");
  const kit = await ensureBrandKit(cap, "https://www.example.com/");
  assert.deepEqual(kit.fonts.map((f) => f.source), ["auto", "auto"]);
  assert.equal(kit.fontImport, undefined);
  assert.deepEqual(kit.logos, []);
  assert.deepEqual(readBrandKit(cap), JSON.parse(JSON.stringify(kit)));
  const note = brandKitNote(kit);
  assert.match(note, /auto-resolved by HyperFrames/);
  assert.match(note, /Set the brand name as type/);
  assert.doesNotMatch(note, /@import/);
});

test("brand kit note tells builders the exact font import and logo path", () => {
  const note = brandKitNote({
    fonts: [{ family: "Geist", source: "google", use: "Geist" }, { family: "Acme Sans", source: "substitute", use: "Inter" }],
    fontImport: "https://fonts.googleapis.com/css2?family=Geist&display=block",
    logos: [{ path: "capture/assets/logo/acme-logo.png", width: 600, height: 200, from: "https://acme.test/logo.png" }],
  });
  assert.match(note, /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Geist&display=block'\);/);
  assert.match(note, /Acme Sans \(not available, use Inter\)/);
  assert.match(note, /capture\/assets\/logo\/acme-logo\.png` \(600×200\)/);
  assert.match(note, /no larger than its pixel size/);
  assert.equal(brandSlug("https://www.byreel.in/"), "byreel");
});
