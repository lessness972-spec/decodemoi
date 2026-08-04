function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

const ROOM_RE = /^[A-Z0-9]{4,10}$/;
const LEVEL_COUNT = 12;

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/room\/([^/]+)\/?$/);
    if (match) {
      return handleRoom(request, env, decodeURIComponent(match[1]).toUpperCase());
    }
    return env.ASSETS.fetch(request);
  }
};
