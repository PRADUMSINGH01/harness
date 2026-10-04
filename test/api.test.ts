import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HARNESS_ROOT } from "../src/config.ts";
import { ROUTES, openapi, toOpenApiPath } from "../src/openapi.ts";
import { apiKeyGuard, dataDir } from "../src/api.ts";

// Every app.get/post/delete/use("...") in the server and the API module, as "method path".
function registered(): string[] {
  const out: string[] = [];
  for (const file of ["src/server.ts", "src/api.ts"]) {
    const src = readFileSync(join(HARNESS_ROOT, file), "utf8");
    for (const m of src.matchAll(/app\.(get|post|delete|use)\(\s*"([^"]+)"/g)) {
      const [, method, path] = m;
      // app.use(prefix, handler) serves files under the prefix.
      out.push(method === "use" ? `get ${path}/*` : `${method} ${path}`);
    }
  }
  return out;
}

test("every registered route is in the OpenAPI document", () => {
  const documented = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
  const missing = registered().filter((r) => !documented.has(r));
  assert.deepEqual(missing, []);
});

test("the OpenAPI document has no routes the server doesn't serve", () => {
  const served = new Set(registered());
  const stale = ROUTES.map((r) => `${r.method} ${r.path}`).filter((r) => !served.has(r));
  assert.deepEqual(stale, []);
});

test("the OpenAPI document is well formed: path params declared, unique operation ids", () => {
  const doc = openapi("http://localhost:8100", true);
  const ids = new Set<string>();
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const op of Object.values(ops) as any[]) {
      assert.ok(!ids.has(op.operationId), `duplicate operationId ${op.operationId}`);
      ids.add(op.operationId);
      const declared = (op.parameters ?? []).filter((p: any) => p.in === "path").map((p: any) => p.name);
      const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      assert.deepEqual(declared, inPath, path);
    }
  }
  assert.equal(toOpenApiPath("/quick-play/:id/:t/*"), "/quick-play/{id}/{t}/{file}");
  assert.deepEqual((doc.paths["/health"].get as { security?: unknown }).security, []);
});

function call(guard: ReturnType<typeof apiKeyGuard>, req: { path: string; headers?: Record<string, string>; query?: Record<string, string> }) {
  const headers = Object.fromEntries(Object.entries(req.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const fake: any = { path: req.path, headers, query: req.query ?? {}, get: (h: string) => headers[h.toLowerCase()] };
  const res: any = { statusCode: 200, headers: {}, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; }, setHeader(k: string, v: string) { this.headers[k] = v; } };
  let passed = false;
  guard(fake, res, () => (passed = true));
  return { passed, res };
}

test("API key: off when unset; header, bearer, cookie and ?key= accepted; health stays open", () => {
  assert.ok(call(apiKeyGuard(undefined), { path: "/runs" }).passed);
  const guard = apiKeyGuard("s3cret");
  assert.equal(call(guard, { path: "/runs" }).res.statusCode, 401);
  assert.equal(call(guard, { path: "/runs", headers: { "x-api-key": "nope" } }).res.statusCode, 401);
  assert.ok(call(guard, { path: "/health" }).passed);
  assert.ok(call(guard, { path: "/docs" }).passed);
  assert.ok(call(guard, { path: "/runs", headers: { "x-api-key": "s3cret" } }).passed);
  assert.ok(call(guard, { path: "/runs", headers: { authorization: "Bearer s3cret" } }).passed);
  assert.ok(call(guard, { path: "/runs", headers: { cookie: "a=1; hf_key=s3cret" } }).passed);
  const viaQuery = call(guard, { path: "/launch", query: { key: "s3cret" } });
  assert.ok(viaQuery.passed);
  assert.match(viaQuery.res.headers["set-cookie"], /^hf_key=s3cret;.*HttpOnly/);
});

test("project paths must sit inside the harness data folders", () => {
  assert.throws(() => dataDir("/etc"), /inside the harness data folders/);
  assert.throws(() => dataDir(join(HARNESS_ROOT, "..", "outside")), /inside the harness data folders/);
  assert.throws(() => dataDir(""), /required/);
  assert.equal(dataDir(join(HARNESS_ROOT, "runs", "x")), join(HARNESS_ROOT, "runs", "x"));
});
