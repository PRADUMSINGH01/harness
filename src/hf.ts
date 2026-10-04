// Async wrapper over the HyperFrames CLI, pinned to the vendored clone's version.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { HARNESS_ROOT, HF_ROOT } from "./config.ts";

export interface CmdResult {
  cmd: string;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  ms: number;
}

let cachedVersion: string | undefined;
export function hfVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = JSON.parse(readFileSync(join(HF_ROOT, "plugin.json"), "utf8")).version;
  } catch {
    cachedVersion = "latest";
  }
  return cachedVersion!;
}

// The CLI as a shell command. The harness's own node_modules copy (same pinned version) runs
// directly with node; `npx --yes` re-resolves the package on every call, about 10s each.
let cachedCli: string | undefined;
export function hfCli(): string {
  if (cachedCli) return cachedCli;
  const bin = join(HARNESS_ROOT, "node_modules", "hyperframes", "bin", "hyperframes.mjs");
  let local = "";
  try {
    local = JSON.parse(readFileSync(join(HARNESS_ROOT, "node_modules", "hyperframes", "package.json"), "utf8")).version;
  } catch {}
  cachedCli = existsSync(bin) && local === hfVersion() ? `node ${quote(bin.replace(/\\/g, "/"))}` : `npx --yes hyperframes@${hfVersion()}`;
  return cachedCli;
}

export function quote(arg: string | number): string {
  const s = String(arg);
  if (/^[\w@%+=:,./\\-]+$/.test(s)) return s;
  // Plain double quotes work in both cmd.exe and sh; JSON.stringify would double Windows backslashes.
  return `"${s.replace(/"/g, '\\"')}"`;
}

export function runCmd(
  cmd: string,
  { cwd, timeoutMs = 600_000, env = {}, onLine }: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; onLine?: (line: string) => void } = {},
): Promise<CmdResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...env },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const feed = (chunk: Buffer, sink: "out" | "err") => {
      const text = chunk.toString("utf8");
      if (sink === "out") stdout += text;
      else stderr += text;
      if (onLine) for (const line of text.split(/\r?\n/)) if (line.trim()) onLine(line);
    };
    child.stdout.on("data", (c) => feed(c, "out"));
    child.stderr.on("data", (c) => feed(c, "err"));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ cmd, code, stdout, stderr, timedOut, ms: Date.now() - started });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ cmd, code: -1, stdout, stderr: stderr + String(err), timedOut, ms: Date.now() - started });
    });
  });
}

// `shell: true` puts a shell between us and the CLI; kill the whole tree or Chrome outlives the job.
export function killTree(pid?: number) {
  if (!pid) return;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    else process.kill(-pid, "SIGKILL");
  } catch {}
}

// Run a node script without a shell, so the caller knows the script's own PID.
export function runNode(
  script: string,
  args: string[],
  { cwd, timeoutMs = 600_000, env = {} }: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<CmdResult & { pid?: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, windowsHide: true, env: { ...process.env, NO_COLOR: "1", ...env } });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ cmd: `node ${script} ${args.join(" ")}`, code, stdout, stderr, timedOut, ms: Date.now() - started, pid: child.pid });
    });
  });
}

// Windows has no process groups: a detached grandchild (e.g. Chrome launched by a script) survives
// its parent. Reap every process whose parent was `pid`.
export async function killChildrenOf(pid?: number) {
  if (!pid) return;
  if (process.platform !== "win32") {
    await runCmd(`pkill -KILL -P ${pid}`, { timeoutMs: 15_000 });
    return;
  }
  const ps = `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}' | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }`;
  await runCmd(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { timeoutMs: 30_000 });
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

// A HyperFrames preview server the harness owns, so it is always torn down.
// Note: preview (Studio) stamps stable `data-hf-id` attributes into the project's HTML.
export async function startPreview(cwd: string): Promise<{ url: string; stop: () => void }> {
  const port = await freePort();
  const env = { ...process.env, NO_COLOR: "1" } as Record<string, string>;
  delete env.HYPERFRAME_RUNTIME_URL; // a wrong value fails silently as 200 HTML
  const child = spawn(`${hfCli()} preview --foreground --no-open --port ${port}`, { cwd, shell: true, windowsHide: true, env });
  child.stdout?.resume();
  child.stderr?.resume();
  const url = `http://localhost:${port}`;
  const stop = () => killTree(child.pid);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const r = await fetch(`${url}/api/projects`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return { url, stop };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`preview server on ${url} never became ready`);
}

export function runHf(args: (string | number)[], opts: Parameters<typeof runCmd>[1] = {}) {
  return runCmd(`${hfCli()} ${args.map(quote).join(" ")}`, opts);
}

// CLI output may carry log lines before the JSON document; take the outermost object.
export function parseJsonOut(text: string): any {
  if (!text) return null;
  const starts: number[] = [];
  if (/^\s*[{[]/.test(text)) starts.push(text.search(/[{[]/));
  for (const m of text.matchAll(/\n([{[])/g)) starts.push(m.index! + 1);
  for (const start of starts) {
    const close = text[start] === "{" ? "}" : "]";
    const end = text.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

let cachedChrome: string | null | undefined;
export async function chromePath(): Promise<string | null> {
  if (cachedChrome !== undefined) return cachedChrome;
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return (cachedChrome = process.env.CHROME_PATH);
  const r = await runHf(["browser", "path"], { timeoutMs: 120_000 });
  const line = `${r.stdout}\n${r.stderr}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .reverse()
    .find((l) => l && existsSync(l));
  return (cachedChrome = line || null);
}

export async function hasBinary(name: string): Promise<boolean> {
  const probe = process.platform === "win32" ? `where ${name}` : `command -v ${name}`;
  return (await runCmd(probe, { timeoutMs: 15_000 })).code === 0;
}
