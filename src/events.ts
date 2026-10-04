// Progress events: kept in memory for SSE subscribers and appended to runs/<id>/events.jsonl.
import { EventEmitter } from "node:events";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runDir } from "./runs/store.ts";

export interface HarnessEvent {
  ts: string;
  run: string;
  type: string;
  variant?: string;
  message: string;
  data?: unknown;
}

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export function emit(run: string, type: string, message: string, extra: { variant?: string; data?: unknown } = {}) {
  const event: HarnessEvent = { ts: new Date().toISOString(), run, type, message, ...extra };
  const dir = runDir(run);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "events.jsonl"), JSON.stringify(event) + "\n");
  bus.emit(`run:${run}`, event);
  const tag = extra.variant ? `${run}/${extra.variant}` : run;
  console.log(`[${event.ts.slice(11, 19)}] ${tag} ${type}: ${message}`);
  return event;
}

export function history(run: string, limit = 200): HarnessEvent[] {
  const path = join(runDir(run), "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .map((l) => JSON.parse(l));
}

// Counting semaphore: Chrome-heavy gates and agent builds each get their own budget.
export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
