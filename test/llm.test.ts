import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";

// Judge logs land under the runs dir; keep tests out of the real one. Set before src/ loads config.
process.env.HF_HARNESS_RUNS = mkdtempSync(join(tmpdir(), "hf-runs-"));
const { runAgent } = await import("../src/llm/agent.ts");

// A scripted OpenAI-compatible endpoint: replies[i] answers request i; requests are recorded.
// Streaming requests get SSE chunks the way Z.ai/Gemini send them: reasoning, content, then tool
// calls split across chunks by index, then a usage chunk.
async function mockProvider(replies: any[]) {
  const requests: any[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      const message = replies[Math.min(requests.length - 1, replies.length - 1)];
      const base = { id: "x", created: 0, model: "mock" };
      const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
      if (!parsed.stream) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message }], usage }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (delta: any, extra: any = {}) =>
        res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`);
      if (message.reasoning_content) for (const part of message.reasoning_content.match(/.{1,8}/gs)) send({ reasoning_content: part });
      if (message.content) send({ role: "assistant", content: message.content });
      (message.tool_calls ?? []).forEach((tc: any, index: number) => {
        const args = tc.function.arguments;
        const { function: _f, ...rest } = tc;
        send({ tool_calls: [{ index, ...rest, function: { name: tc.function.name, arguments: args.slice(0, 5) } }] });
        send({ tool_calls: [{ index, function: { arguments: args.slice(5) } }] });
      });
      res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [], usage })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;
  return { client: new OpenAI({ apiKey: "test", baseURL: `http://127.0.0.1:${port}/v1`, maxRetries: 0 }), requests, close: () => server.close() };
}

const call = (id: string, name: string, args: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
  ...extra,
});

test("agent loop runs tools, enforces the sandbox and denylist, and stops on finish", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hf-agent-"));
  const outside = mkdtempSync(join(tmpdir(), "hf-outside-"));
  writeFileSync(join(outside, "skill.md"), "line one\nline two\n");
  const signature = { google: { thought_signature: "sig-1" } };
  const mock = await mockProvider([
    {
      role: "assistant",
      reasoning_content: "The brief wants kinetic type; read the skill first.",
      content: "Reading the skill.",
      tool_calls: [call("a", "read_file", { path: join(outside, "skill.md") }, { extra_content: signature })],
    },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        call("b", "write_file", { path: "index.html", content: "<p>hi</p>" }),
        call("c", "write_file", { path: join(outside, "evil.txt"), content: "x" }),
        call("d", "run_command", { command: "npx hyperframes render ." }),
        call("e", "run_command", { command: "echo built" }),
        call("f", "edit_file", { path: "index.html", old_string: "hi", new_string: "hello" }),
      ],
    },
    { role: "assistant", content: null, tool_calls: [call("g", "finish", { summary: "variant done" })] },
  ]);
  const logs: string[] = [];
  const trace: any[] = [];
  const result = await runAgent({
    client: mock.client,
    model: "mock",
    system: "sys",
    prompt: "build it",
    cwd,
    readRoots: [outside],
    maxTurns: 10,
    signal: new AbortController().signal,
    log: (m) => logs.push(m),
    trace: (e) => trace.push(e),
    extraBody: { reasoning_effort: "low" },
  });
  mock.close();

  // Streaming + extras reach the provider; thinking, plans, calls and results are all traced.
  assert.equal(mock.requests[0].stream, true);
  assert.equal(mock.requests[0].reasoning_effort, "low");
  assert.deepEqual(
    trace.filter((e) => e.turn === 1).map((e) => e.kind),
    ["request", "thinking", "say", "turn_done", "tool_call", "tool_result"],
  );
  assert.equal(trace.find((e) => e.kind === "thinking").text, "The brief wants kinetic type; read the skill first.");
  assert.equal(trace.filter((e) => e.kind === "tool_call").length, 7);
  assert.equal(trace.at(-1).kind, "end");

  assert.equal(result.status, "finished");
  assert.equal(result.summary, "variant done");
  assert.equal(result.turns, 3);
  assert.deepEqual(result.usage, { prompt: 30, completion: 15 });
  assert.equal(readFileSync(join(cwd, "index.html"), "utf8"), "<p>hello</p>");
  assert.ok(!existsSync(join(outside, "evil.txt")), "writes outside cwd are refused");

  const second = mock.requests[1].messages;
  // The assistant tool call goes back verbatim, Gemini thought signature included.
  assert.deepEqual(second.find((m: any) => m.role === "assistant").tool_calls[0].extra_content, signature);
  assert.match(second.find((m: any) => m.tool_call_id === "a").content, /1\tline one/);

  const third = mock.requests[2].messages;
  const out = (id: string) => third.find((m: any) => m.tool_call_id === id).content;
  assert.match(out("c"), /writes are limited/);
  assert.match(out("d"), /^refused: render is gated/);
  assert.match(out("e"), /^exit 0\nbuilt/);
  assert.equal(mock.requests[0].tool_choice, "auto");
  assert.ok(mock.requests[0].tools.some((t: any) => t.function.name === "finish"));
});

test("agent nudges a model that stops calling tools, then ends", async () => {
  const mock = await mockProvider([{ role: "assistant", content: "I think I'm done." }]);
  const result = await runAgent({
    client: mock.client,
    model: "mock",
    system: "s",
    prompt: "p",
    cwd: mkdtempSync(join(tmpdir(), "hf-agent-")),
    readRoots: [],
    maxTurns: 10,
    signal: new AbortController().signal,
    log: () => {},
  });
  mock.close();
  assert.equal(result.status, "finished");
  assert.equal(mock.requests.length, 3, "two nudges, then accept");
  assert.match(mock.requests[1].messages.at(-1).content, /call finish/);
});

test("vision judge sends images as data URLs and accepts {scorecards: [...]}", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hf-judge-"));
  const png = join(dir, "frame.png");
  const sheet = join(dir, "compare.png");
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(sheet, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const cards = [{ judge: "j1", label: "A" }];
  const mock = await mockProvider([{ role: "assistant", content: "```json\n" + JSON.stringify({ scorecards: cards }) + "\n```" }]);
  const { JUDGES } = await import("../src/drivers/judge.ts");
  const providers = await import("../src/llm/providers.ts");
  // Point the gemini profile at the mock for this test.
  process.env.GEMINI_API_KEY = "test";
  process.env.GEMINI_URL = new URL("/v1", (mock.client as any).baseURL).href;
  const outcome = await JUDGES.gemini.judge({
    run: { id: "judge-test", drivers: {} } as any,
    genre: {} as any,
    judgeId: "j1",
    materials: {
      text: "rubric",
      path: "",
      images: [
        { label: "A", path: png, caption: "Candidate A: frame at t=1s" },
        { label: "*", path: sheet, caption: "All candidates side by side at t=2s" },
      ],
    },
    log: () => {},
    emit: () => {},
  });
  mock.close();
  assert.equal(providers.provider("gemini").baseURL, process.env.GEMINI_URL);
  assert.deepEqual(outcome, { status: "done", cards });
  const content = mock.requests[0].messages[0].content;
  const captions = content.filter((p: any) => p.type === "text").map((p: any) => p.text);
  assert.equal(captions[1], "All candidates side by side at t=2s", "compare sheets go first");
  assert.ok(content.filter((p: any) => p.type === "image_url").every((p: any) => p.image_url.url.startsWith("data:image/png;base64,")));
});

test("trace log writes readable markdown, full jsonl, and clipped events", async () => {
  const { createTraceLog } = await import("../src/llm/tracelog.ts");
  const dir = mkdtempSync(join(tmpdir(), "hf-trace-"));
  const events: [string, string][] = [];
  const t = createTraceLog({ dir, title: "run / v1", emit: (type, m) => events.push([type, m]) });
  t({ kind: "request", turn: 1, messages: 2, contextChars: 52000 });
  t({ kind: "thinking", turn: 1, text: "Plan the ticker first." });
  t({ kind: "tool_call", turn: 1, id: "a", name: "write_file", args: { path: "index.html", content: "x".repeat(9000) } });
  t({ kind: "tool_result", turn: 1, id: "a", name: "write_file", output: "wrote index.html", ms: 3 });
  t({ kind: "end", turn: 1, status: "finished", summary: "done", usage: { prompt: 1200, completion: 300 } });
  const md = readFileSync(join(dir, "agent-log.md"), "utf8");
  assert.match(md, /## Turn 1/);
  assert.match(md, /> Plan the ticker first\./);
  assert.match(md, /### → write_file index\.html \(9\.0k chars\)/);
  assert.match(md, /more chars in agent-log\.jsonl/, "long args are clipped in markdown");
  const jsonl = readFileSync(join(dir, "agent-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(jsonl[2].args.content.length, 9000, "jsonl keeps everything");
  assert.deepEqual(events.map((e) => e[0]), ["agent.request", "agent.thinking", "agent.tool", "agent.result", "agent.end"]);
});

test("Z.ai defaults to low reasoning effort; env can override or disable it", async () => {
  const { provider, requestExtras } = await import("../src/llm/providers.ts");
  delete process.env.ZAI_REASONING_EFFORT;
  assert.deepEqual(requestExtras(provider("zai")), { reasoning_effort: "low" });
  process.env.ZAI_REASONING_EFFORT = "medium";
  assert.deepEqual(requestExtras(provider("zai")), { reasoning_effort: "medium" });
  process.env.ZAI_REASONING_EFFORT = "default";
  assert.deepEqual(requestExtras(provider("zai")), {});
  delete process.env.ZAI_REASONING_EFFORT;
  delete process.env.GEMINI_REASONING_EFFORT;
  assert.deepEqual(requestExtras(provider("gemini")), {});
});

test("worker packets inline the genre essentials and the seed's own files", async () => {
  const { getGenre } = await import("../src/genres.ts");
  const { inlinedFor } = await import("../src/runs/packets.ts");
  const g = getGenre("motion-graphics");
  const files = inlinedFor(g, { seed: { values: { signature_move: "ticker-takeover", palette: "dark-premium" } } } as any);
  const rels = files.map((f) => f.rel);
  assert.ok(rels.includes("skills/motion-graphics/SKILL.md"));
  assert.ok(rels.includes(".claude/skills/motion-doctrine/SKILL.md"));
  assert.ok(rels.includes("skills/hyperframes-animation/blueprints/ticker-takeover.md"));
  assert.ok(rels.includes("skills/hyperframes-creative/palettes/dark-premium.md"));
  assert.ok(files.every((f) => f.content.length > 100));
  const chars = files.reduce((a, f) => a + f.content.length, 0);
  assert.ok(chars < 80_000, `packet references should stay compact, got ${chars} chars`);
});

test("a build that never finishes is warned at 80% of its budget, then stopped", async () => {
  // Every reply is another tool call; each request reports 10 prompt tokens.
  const mock = await mockProvider([{ role: "assistant", content: null, tool_calls: [call("x", "list_files", { path: "." })] }]);
  const trace: any[] = [];
  const result = await runAgent({
    client: mock.client,
    model: "mock",
    system: "s",
    prompt: "p",
    cwd: mkdtempSync(join(tmpdir(), "hf-agent-")),
    readRoots: [],
    maxTurns: 100,
    budget: { maxInputTokens: 50 },
    signal: new AbortController().signal,
    log: () => {},
    trace: (e) => trace.push(e),
  });
  mock.close();
  assert.equal(result.status, "budget");
  assert.equal(mock.requests.length, 5, "stops once 50 input tokens are spent");
  const warning = trace.find((e) => e.kind === "say" && e.text.startsWith("[harness] Budget"));
  assert.ok(warning, "the agent is told to wrap up first");
  assert.ok(mock.requests.at(-1).messages.some((m: any) => m.role === "user" && /Wrap up now/.test(m.content)));
});

test("framework source is unreadable even inside the read roots", async () => {
  const root = mkdtempSync(join(tmpdir(), "hf-root-"));
  mkdirSync(join(root, "packages"));
  writeFileSync(join(root, "packages", "src.ts"), "secret");
  writeFileSync(join(root, "SKILL.md"), "skill");
  const mock = await mockProvider([
    { role: "assistant", content: null, tool_calls: [call("a", "read_file", { path: join(root, "packages", "src.ts") }), call("b", "read_file", { path: join(root, "SKILL.md") })] },
    { role: "assistant", content: null, tool_calls: [call("c", "finish", { summary: "ok" })] },
  ]);
  await runAgent({
    client: mock.client,
    model: "mock",
    system: "s",
    prompt: "p",
    cwd: mkdtempSync(join(tmpdir(), "hf-agent-")),
    readRoots: [root],
    denyReadRoots: [join(root, "packages")],
    maxTurns: 5,
    signal: new AbortController().signal,
    log: () => {},
  });
  mock.close();
  const out = (id: string) => mock.requests[1].messages.find((m: any) => m.tool_call_id === id).content;
  assert.match(out("a"), /framework source code is not/);
  assert.match(out("b"), /1\tskill/);
});

test("a tool call with missing arguments is an error for the model, never a crash", async () => {
  const mock = await mockProvider([
    { role: "assistant", content: null, tool_calls: [call("a", "read_file", {}), call("b", "edit_file", { old_string: "x" }), call("c", "list_files", { path: 42 })] },
    { role: "assistant", content: null, tool_calls: [call("d", "finish", { summary: "ok" })] },
  ]);
  const result = await runAgent({
    client: mock.client,
    model: "mock",
    system: "s",
    prompt: "p",
    cwd: mkdtempSync(join(tmpdir(), "hf-agent-")),
    readRoots: [],
    maxTurns: 5,
    signal: new AbortController().signal,
    log: () => {},
  });
  mock.close();
  assert.equal(result.status, "finished");
  const out = (id: string) => mock.requests[1].messages.find((m: any) => m.tool_call_id === id).content;
  for (const id of ["a", "b", "c"]) assert.match(out(id), /^error: \w+ needs a "path" string argument/);
});
