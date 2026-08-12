function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

const ROOM_RE = /^[A-Z0-9]{4,10}$/;
const LEVEL_COUNT = 12;
const DEV_CODE = "1397";
const REPORTS_KEY = "reports";
const CONFIG_KEY = "config";
const MAX_REPORTS = 200;

function isDevRequest(request) {
  return request.headers.get("x-dev-code") === DEV_CODE;
}

function mergeBoolArray(a, b) {
  const out = new Array(LEVEL_COUNT).fill(false);
  for (let i = 0; i < LEVEL_COUNT; i++) out[i] = Boolean((a && a[i]) || (b && b[i]));
  return out;
}
function mergeBoolMap(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((k) => { if (b[k]) out[k] = true; });
  return out;
}
function mergeTimerStarts(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((k) => {
    const bv = b[k];
    if (!bv) return;
    out[k] = out[k] ? Math.min(out[k], bv) : bv;
  });
  return out;
}
function mergeSharedAnswers(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((k) => {
    const existing = out[k] || {};
    const incoming = b[k] || {};
    out[k] = { teen: incoming.teen || existing.teen || "", parent: incoming.parent || existing.parent || "" };
  });
  return out;
}
function mergeRoom(existing, incoming) {
  const base = existing || {};
  return {
    team: incoming.team || base.team || "",
    teen: incoming.teen || base.teen || "",
    parentName: incoming.parentName || base.parentName || "",
    room: incoming.room || base.room || "",
    completed: mergeBoolArray(base.completed, incoming.completed),
    parentAnswers: mergeBoolMap(base.parentAnswers, incoming.parentAnswers),
    rewards: { ...(incoming.rewards || {}), ...(base.rewards || {}) },
    sharedAnswers: mergeSharedAnswers(base.sharedAnswers, incoming.sharedAnswers),
    timerStarts: mergeTimerStarts(base.timerStarts, incoming.timerStarts),
    togetherUnlocked: mergeBoolMap(base.togetherUnlocked, incoming.togetherUnlocked),
    childJoined: Boolean(base.childJoined || incoming.childJoined),
    finalRiddlesSolved: Boolean(base.finalRiddlesSolved || incoming.finalRiddlesSolved),
    teenLastSeen: Math.max(Number(base.teenLastSeen) || 0, Number(incoming.teenLastSeen) || 0),
    parentLastSeen: Math.max(Number(base.parentLastSeen) || 0, Number(incoming.parentLastSeen) || 0),
    updatedAt: Date.now()
  };
}

async function handleRoom(request, env, code) {
  if (!code || !ROOM_RE.test(code)) return json({ error: "invalid_room" }, 400);
  const key = "room:" + code;

  if (request.method === "GET") {
    const raw = await env.ROOMS.get(key);
    if (!raw) return json({ error: "not_found" }, 404);
    return json(JSON.parse(raw));
  }

  if (request.method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "bad_json" }, 400);
    }
    const existingRaw = await env.ROOMS.get(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;
    const merged = mergeRoom(existing, body);
    await env.ROOMS.put(key, JSON.stringify(merged), { expirationTtl: 60 * 60 * 24 * 120 });
    return json(merged);
  }

  return json({ error: "method_not_allowed" }, 405);
}

async function handleReports(request, env) {
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "bad_json" }, 400);
    }
    const report = {
      id: crypto.randomUUID(),
      name: String(body.name || "").slice(0, 60),
      team: String(body.team || "").slice(0, 60),
      room: String(body.room || "").slice(0, 12),
      message: String(body.message || "").slice(0, 1000),
      device: String(body.device || "").slice(0, 200),
      ts: Date.now()
    };
    if (!report.message) return json({ error: "empty_message" }, 400);
    const raw = await env.ROOMS.get(REPORTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(report);
    await env.ROOMS.put(REPORTS_KEY, JSON.stringify(list.slice(0, MAX_REPORTS)));
    return json({ ok: true });
  }

  if (!isDevRequest(request)) return json({ error: "forbidden" }, 403);

  if (request.method === "GET") {
    const raw = await env.ROOMS.get(REPORTS_KEY);
    return json({ reports: raw ? JSON.parse(raw) : [] });
  }

  if (request.method === "DELETE") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "bad_json" }, 400);
    }
    const raw = await env.ROOMS.get(REPORTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const filtered = body.id ? list.filter((r) => r.id !== body.id) : [];
    await env.ROOMS.put(REPORTS_KEY, JSON.stringify(filtered));
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
}

async function handleConfig(request, env) {
  if (request.method === "GET") {
    const raw = await env.ROOMS.get(CONFIG_KEY);
    return json(raw ? JSON.parse(raw) : {});
  }

  if (!isDevRequest(request)) return json({ error: "forbidden" }, 403);

  if (request.method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "bad_json" }, 400);
    }
    const raw = await env.ROOMS.get(CONFIG_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    const merged = { ...existing, ...body };
    await env.ROOMS.put(CONFIG_KEY, JSON.stringify(merged));
    return json(merged);
  }

  return json({ error: "method_not_allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/room\/([^/]+)\/?$/);
    if (match) {
      return handleRoom(request, env, decodeURIComponent(match[1]).toUpperCase());
    }
    if (url.pathname === "/api/reports") return handleReports(request, env);
    if (url.pathname === "/api/config") return handleConfig(request, env);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-cache, must-revalidate");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
