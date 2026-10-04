// Image build step: download HyperFrames' pinned chrome-headless-shell and print its path
// (the Dockerfile stores it; docker/entrypoint.sh exports it for every Chrome user).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const cli = "node_modules/hyperframes/bin/hyperframes.mjs";
const run = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "inherit"] });

run(["browser", "ensure"]);
const out = run(["browser", "path"]);
const path = out
  .split(/\r?\n/)
  .map((l) => l.trim())
  .reverse()
  .find((l) => l && existsSync(l));
if (!path) {
  console.error(`no Chrome after "hyperframes browser ensure":\n${out}`);
  process.exit(1);
}
process.stdout.write(path);
