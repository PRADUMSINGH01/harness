// The OpenAPI 3.1 description of every route, built from one table. test/api.test.ts checks that
// each route registered in server.ts and api.ts is listed here, so the docs can't drift.

type Schema = Record<string, unknown>;
type Returns = "json" | "html" | "markdown" | "file" | "mp4" | "sse";

export interface RouteDoc {
  method: "get" | "post" | "delete";
  // Express style: ":param" segments, and a trailing "/*" for a file path under a folder.
  path: string;
  tag: string;
  summary: string;
  description?: string;
  query?: Record<string, Schema & { required?: boolean }>;
  body?: { properties: Record<string, Schema>; required?: string[]; array?: boolean };
  returns?: Returns;
  status?: number;
}

const str = (description: string, extra: Schema = {}): Schema => ({ type: "string", description, ...extra });
const num = (description: string, extra: Schema = {}): Schema => ({ type: "number", description, ...extra });
const bool = (description: string): Schema => ({ type: "boolean", description });
const strs = (description: string): Schema => ({ type: "array", items: { type: "string" }, description });
const url = str("A public page, http(s)://", { example: "https://resend.com" });

const ASPECT = { type: "string", enum: ["16:9", "9:16"] };

export const ROUTES: RouteDoc[] = [
  // ----- system -----
  { method: "get", path: "/", tag: "System", summary: "Service info and a short endpoint list" },
  { method: "get", path: "/health", tag: "System", summary: "Readiness: HyperFrames, Chrome, FFmpeg, model providers, concurrency", description: "Open even when an API key is set." },
  { method: "get", path: "/openapi.json", tag: "System", summary: "This OpenAPI document" },
  { method: "get", path: "/docs", tag: "System", summary: "Interactive API docs (Swagger UI)", returns: "html" },
  { method: "get", path: "/providers", tag: "System", summary: "Model providers as configured: base URL, models, whether a key is set, builder/judge readiness" },
  { method: "get", path: "/gates", tag: "System", summary: "Every quality gate: id, whether it needs Chrome, what it checks" },
  { method: "get", path: "/templates", tag: "System", summary: "Quick-mode film templates" },
  { method: "get", path: "/genres", tag: "System", summary: "Genres (short video, motion graphics, product launch) with their axes and judge dimensions" },
  { method: "get", path: "/genres/:id", tag: "System", summary: "One genre in full" },
  { method: "get", path: "/memory", tag: "System", summary: "Lessons learned across runs, and per-axis stats", query: { genre: str("Genre id; adds axis statistics") } },
  { method: "get", path: "/ui", tag: "System", summary: "Run dashboard", returns: "html" },
  { method: "get", path: "/launch", tag: "Website trailers", summary: "Launch page: paste a URL, get a trailer", returns: "html" },

  // ----- website trailers / quick jobs -----
  {
    method: "post",
    path: "/quick",
    tag: "Website trailers",
    summary: "Start a video job for a website",
    description:
      'mode "trailer" clones the landing page as code and films it as a website trailer (up to 60s); "launch" builds a launch film from the page structure and screenshots; "templates" makes one 10s film per template. Returns at once; poll GET /quick/{id}.',
    status: 202,
    body: {
      required: ["url"],
      properties: {
        url,
        mode: { type: "string", enum: ["trailer", "launch", "templates"], default: "templates" },
        aspect: ASPECT,
        aspects: { type: "array", items: ASPECT, description: "trailer/launch: every format to make" },
        brief: str("Anything the film must say (offer, audience, launch date)"),
        templates: strs("templates mode: template ids (default: every fitting template)"),
        provider: str("Model provider for copywriting (templates/launch)", { default: "zai" }),
        style: { type: "object", description: "templates mode: { background, transition: iris|diagonal|stripes, grain }" },
      },
    },
  },
  { method: "get", path: "/quick", tag: "Website trailers", summary: "Every video job, newest first", query: { limit: num("Max jobs (default 50)") } },
  { method: "get", path: "/quick/:id", tag: "Website trailers", summary: "A job: status, phase timings, results with quality scores and player URLs" },
  { method: "delete", path: "/quick/:id", tag: "Website trailers", summary: "Delete a finished job and its files" },
  { method: "post", path: "/quick/:id/render", tag: "Website trailers", summary: "Render one result to MP4 (needs FFmpeg)", status: 202, body: { required: ["template"], properties: { template: str("Result name, e.g. trailer-landscape") } } },
  { method: "get", path: "/quick/:id/download/:template", tag: "Website trailers", summary: "Download a rendered MP4", returns: "mp4" },
  { method: "get", path: "/quick-view/:id", tag: "Website trailers", summary: "Watch a job's videos in the browser", returns: "html" },
  { method: "get", path: "/quick-play/:id/:t/*", tag: "Website trailers", summary: "A result's composition with the HyperFrames runtime (for <hyperframes-player>) and its files", returns: "file" },
  {
    method: "post",
    path: "/frames",
    tag: "Website trailers",
    summary: "Still frames of a video at chosen times",
    description: "Give quickId + template for a job result, or projectDir for any project under runs/ or quick/.",
    body: {
      required: ["at"],
      properties: { at: { type: "array", items: { type: "number" }, description: "Times in seconds (1-24)", example: [1.5, 10, 22] }, quickId: str("Quick job id"), template: str("Result name"), projectDir: str("Project folder") },
    },
  },

  // ----- sites (clones) -----
  { method: "get", path: "/sites", tag: "Sites", summary: "Every cloned site" },
  {
    method: "post",
    path: "/sites",
    tag: "Sites",
    summary: "Clone a landing page as code: header, hero, features, sections, logos, pricing, fonts, images",
    description: "Cached per URL; a fresh site takes about a minute. refresh: true clones again.",
    status: 201,
    body: { required: ["url"], properties: { url, refresh: bool("Ignore the cached clone") } },
  },
  { method: "get", path: "/sites/:site", tag: "Sites", summary: "A clone: theme and parts (sizes, titles, grounds, animation handles)" },
  { method: "delete", path: "/sites/:site", tag: "Sites", summary: "Delete a cached clone" },
  { method: "get", path: "/sites/:site/preview", tag: "Sites", summary: "Every cloned part at real size on its own ground", returns: "html" },
  { method: "get", path: "/sites/:site/parts/:name", tag: "Sites", summary: "One part: HTML preview, or ?format=json for the raw clone", query: { format: str("json for the raw part", { enum: ["json"] }) }, returns: "html" },
  { method: "get", path: "/sites/:site/clone/*", tag: "Sites", summary: "An image, font or raster the clone references", returns: "file" },

  // ----- page analysis -----
  { method: "post", path: "/capture", tag: "Page analysis", summary: "Capture a page: screenshots, HTML, fonts, logos (cached a day)", body: { required: ["url"], properties: { url } } },
  { method: "get", path: "/captures/:site/*", tag: "Page analysis", summary: "A file from a capture (screenshots/…)", returns: "file" },
  { method: "post", path: "/brandkit", tag: "Page analysis", summary: "The site's brand kit: real fonts (or substitutes) and logos", body: { required: ["url"], properties: { url } } },
  { method: "post", path: "/extract", tag: "Page analysis", summary: "The page's structure as data: navbar, hero, features, pricing, CTAs", body: { required: ["url"], properties: { url } } },

  // ----- gates -----
  {
    method: "post",
    path: "/gate",
    tag: "Gates",
    summary: "Run the quality gates on a HyperFrames project",
    body: {
      required: ["projectDir", "genre"],
      properties: {
        projectDir: str("Project folder under runs/ or quick/"),
        genre: str("Genre id (short-video, motion-graphics, product-launch)"),
        browser: bool("Run the Chrome gates (default true)"),
        only: strs("Gate ids to run (GET /gates)"),
        quick: bool("Everything except seam and snapshot"),
      },
    },
  },

  // ----- runs (agent best-of-N) -----
  {
    method: "post",
    path: "/runs",
    tag: "Runs",
    summary: "Start a best-of-N run: N agent-built variants, gated, judged blind, winner picked",
    status: 201,
    body: {
      required: ["genre", "brief"],
      properties: {
        genre: str("Genre id"),
        brief: {
          type: "object",
          required: ["message"],
          description: "message is the one thing the video must say",
          properties: {
            message: str("The one thing the video must communicate"),
            subject: str(""),
            length: str("e.g. 15s"),
            aspect: str("16:9 or 9:16"),
            audience: str(""),
            destination: str("Where it plays"),
            language: str(""),
            url: str("Site to capture for brand and copy"),
            style_preset: str("Frame preset lock"),
            intent: str(""),
            notes: str(""),
            assets: { type: "array", items: {}, description: "Library ids, files inside the harness, or { id|path, role, required, notes }" },
            logos: strs("Brands whose official logo to fetch"),
          },
        },
        n: num("Variants (1-8, default per genre)"),
        name: str("Run name"),
        builder: str("Builder driver (zai, gemini, dashscope, openai, claude-agent, external)"),
        judge: str("Judge driver"),
        judges: num("Judges per variant"),
        builderModel: str("Model override"),
        judgeModel: str("Model override"),
        locks: { type: "object", description: "Axis values to fix, { axis: value }" },
        axisOptions: { type: "object", description: "Per-axis value menus, { axis: [values] }" },
        start: bool("Start building at once (default true)"),
      },
    },
  },
  { method: "get", path: "/runs", tag: "Runs", summary: "Every run with variant statuses and the winner" },
  { method: "get", path: "/runs/:id", tag: "Runs", summary: "A run's full state" },
  { method: "get", path: "/runs/:id/events", tag: "Runs", summary: "Live events (server-sent events), or ?format=json for history", query: { format: str("json for history", { enum: ["json"] }), limit: num("History length") }, returns: "sse" },
  { method: "get", path: "/runs/:id/variants/:v/packet", tag: "Runs", summary: "The newest build (or repair) packet for a variant", returns: "markdown" },
  { method: "post", path: "/runs/:id/variants/:v/built", tag: "Runs", summary: "An external builder reports a variant built" },
  { method: "post", path: "/runs/:id/variants/:v/gate", tag: "Runs", summary: "Gate a variant again", status: 202 },
  { method: "get", path: "/runs/:id/variants/:v/gates", tag: "Runs", summary: "A variant's latest gate report" },
  { method: "get", path: "/runs/:id/variants/:v/agent-log", tag: "Runs", summary: "The builder agent's trace", query: { format: str("md for the readable log", { enum: ["md"] }), since: num("Only entries after this index") } },
  { method: "get", path: "/runs/:id/judge-log/:judge", tag: "Runs", summary: "A judge's trace", query: { format: str("md for the readable log", { enum: ["md"] }), since: num("Only entries after this index") } },
  { method: "get", path: "/runs/:id/judge-packet", tag: "Runs", summary: "The blind judging packet", query: { judge: str("Judge id (default j1)") }, returns: "markdown" },
  {
    method: "post",
    path: "/runs/:id/scorecards",
    tag: "Runs",
    summary: "Submit judge scorecards",
    body: {
      array: true,
      required: ["judge", "label", "scores", "fatal", "top_fix"],
      properties: { judge: str(""), label: str("Variant label as shown to the judge"), scores: { type: "object", description: "{ dimension: { score, evidence } }" }, fatal: strs(""), top_fix: str(""), notes: str("") },
    },
  },
  { method: "get", path: "/runs/:id/decision", tag: "Runs", summary: "The decision: DECISION.md, or JSON with Accept: application/json", returns: "markdown" },
  { method: "post", path: "/runs/:id/advance", tag: "Runs", summary: "Move the run to its next step now" },
  { method: "post", path: "/runs/:id/reopen", tag: "Runs", summary: "Reopen a decided or failed run" },
  { method: "post", path: "/runs/:id/pause", tag: "Runs", summary: "Pause a run" },
  { method: "post", path: "/runs/:id/resume", tag: "Runs", summary: "Resume a paused run" },
  { method: "post", path: "/runs/:id/cancel", tag: "Runs", summary: "Cancel a run" },
  { method: "post", path: "/runs/:id/render", tag: "Runs", summary: "Render the winner to MP4 (needs FFmpeg)", status: 202 },
  { method: "get", path: "/files/*", tag: "Runs", summary: "Any file under runs/ (snapshots, contact sheets, renders)", returns: "file" },
  { method: "get", path: "/play/:id/:v/*", tag: "Runs", summary: "A variant's composition with the HyperFrames runtime, for <hyperframes-player>", returns: "file" },

  // ----- assets -----
  { method: "get", path: "/assets", tag: "Assets", summary: "Search the asset library", query: { q: str("Search words"), kind: str("logo, photo, icon, background, overlay, shape, doodle, mockup, chart, title, matte, frame, ..."), limit: num("Max items (default 60)") } },
  { method: "get", path: "/assets/item", tag: "Assets", summary: "One asset's metadata", query: { id: str("Asset id", { required: true }) } },
  { method: "get", path: "/assets/file", tag: "Assets", summary: "One asset's file", query: { id: str("Asset id", { required: true }) }, returns: "file" },
  {
    method: "post",
    path: "/assets",
    tag: "Assets",
    summary: "Upload an asset into the library",
    status: 201,
    body: {
      required: ["filename", "dataBase64"],
      properties: { filename: str("Name with extension (svg, png, jpg, webp, mp4, json lottie, woff2, ...)"), dataBase64: str("File bytes, base64"), name: str(""), kind: str(""), tags: strs(""), description: str(""), brand: str(""), license: str("") },
    },
  },
  { method: "post", path: "/assets/reindex", tag: "Assets", summary: "Rebuild the asset index" },
  { method: "post", path: "/projects/assets/use", tag: "Assets", summary: "Stage a library asset into a project", body: { required: ["projectDir", "id"], properties: { projectDir: str(""), id: str("Asset id"), role: str(""), required: bool(""), notes: str("") } } },
  { method: "post", path: "/projects/assets/logo", tag: "Assets", summary: "Fetch a brand's official logo into a project", body: { required: ["projectDir", "brand"], properties: { projectDir: str(""), brand: str("e.g. stripe"), role: str(""), required: bool(""), notes: str("") } } },
];

const MEDIA: Record<Returns, Record<string, Schema>> = {
  json: { "application/json": { schema: { type: "object" } } },
  html: { "text/html": { schema: { type: "string" } } },
  markdown: { "text/markdown": { schema: { type: "string" } } },
  file: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
  mp4: { "video/mp4": { schema: { type: "string", format: "binary" } } },
  sse: { "text/event-stream": { schema: { type: "string" } } },
};

// "/runs/:id/variants/:v" -> "/runs/{id}/variants/{v}"; a trailing "/*" becomes "/{file}".
export const toOpenApiPath = (path: string) => path.replace(/\/\*$/, "/{file}").replace(/:(\w+)/g, "{$1}");

export function openapi(serverUrl: string, keyRequired: boolean) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTES) {
    const path = toOpenApiPath(r.path);
    const params = [
      ...[...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({ name, in: "path", required: true, schema: { type: "string" }, ...(name === "file" ? { description: "File path inside the folder" } : {}) })),
      ...Object.entries(r.query ?? {}).map(([name, { required, ...schema }]) => ({ name, in: "query", required: !!required, schema })),
    ];
    const object = { type: "object", properties: r.body?.properties ?? {}, ...(r.body?.required ? { required: r.body.required } : {}) };
    const status = String(r.status ?? 200);
    (paths[path] ??= {})[r.method] = {
      tags: [r.tag],
      summary: r.summary,
      ...(r.description ? { description: r.description } : {}),
      operationId: `${r.method}${path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c) => (c ? c.toUpperCase() : ""))}`,
      ...(params.length ? { parameters: params } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: r.body.array ? { type: "array", items: object } : object } } } } : {}),
      responses: {
        [status]: { description: "OK", content: MEDIA[r.returns ?? "json"] },
        default: { description: "Error", content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } } },
      },
      ...(r.path === "/health" || r.path === "/openapi.json" || r.path === "/docs" ? { security: [] } : {}),
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "hf-harness API",
      version: "1.0.0",
      description:
        "Website trailers, launch films and agent-built videos around the vendored HyperFrames skills. " +
        (keyRequired ? "This server requires an API key: x-api-key header or Authorization: Bearer <key>." : "This server has no API key set (HARNESS_API_KEY)."),
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
        bearer: { type: "http", scheme: "bearer" },
      },
    },
    security: keyRequired ? [{ apiKey: [] }, { bearer: [] }] : [],
    tags: ["Website trailers", "Sites", "Page analysis", "Runs", "Gates", "Assets", "System"].map((name) => ({ name })),
    paths,
  };
}
