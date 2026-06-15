import "dotenv/config";
import http from "node:http";

import {
  testDb,
  listAll,
  getChRespectingPrivacy,
  getChannelsByIds,
  getStats,
} from "./functions/db.js";
import log from "./functions/logger.js";

const PORT = process.env.PORT || 3002;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "60", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS || "60000",
  10
);

const hits = new Map();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const stamps = (hits.get(ip) || []).filter((t) => t > cutoff);

  if (stamps.length >= RATE_LIMIT_MAX) {
    hits.set(ip, stamps);
    const retryAfter = Math.ceil((stamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return Math.max(retryAfter, 1);
  }

  stamps.push(now);
  hits.set(ip, stamps);
  return 0;
}

// drop empty/stale buckets so the map doesn't grow unbounded
function pruneHits() {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, stamps] of hits) {
    const live = stamps.filter((t) => t > cutoff);
    if (live.length === 0) hits.delete(ip);
    else hits.set(ip, live);
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    if (path === "/health" && req.method === "GET") {
      return json(res, 200, {
        status: "ok",
        service: "api",
        uptime: process.uptime(),
      });
    }

    if (req.method !== "GET") {
      return json(res, 405, { error: "method not allowed" });
    }

    const retryAfter = rateLimited(clientIp(req));
    if (retryAfter) {
      res.setHeader("Retry-After", retryAfter);
      return json(res, 429, { error: "rate limit exceeded", retryAfter });
    }

    if (path === "/channels") {
      const channels = await listAll();
      return json(res, 200, { channels });
    }

    if (path === "/stats") {
      const stats = await getStats();
      if (!stats) return json(res, 500, { error: "could not load stats" });
      return json(res, 200, {
        channels: Number(stats.channels),
        private_channels: Number(stats.private_channels),
        users: Number(stats.users),
        opted_out: Number(stats.opted_out),
        last_scanned: stats.last_scanned ? Number(stats.last_scanned) : null,
      });
    }

    const userMatch = path.match(/^\/users\/([^/]+)\/channels$/);
    if (userMatch) {
      const uid = decodeURIComponent(userMatch[1]);
      const ids = await getChRespectingPrivacy(uid);
      const meta = await getChannelsByIds(ids);
      const byId = new Map(meta.map((c) => [c.channel_id, c]));
      const channels = ids.map((id) => {
        const c = byId.get(id);
        return {
          channel_id: id,
          channel_name: c ? c.channel_name : null,
          is_private: c ? c.is_private : null,
        };
      });
      return json(res, 200, { slack_uid: uid, channels });
    }

    return json(res, 404, { error: "not found" });
  } catch (e) {
    log.error(`request error: ${e.stack || e.message}`);
    if (!res.headersSent) json(res, 500, { error: "internal server error" });
  }
});

process.on("unhandledRejection", (reason) => {
  log.error(
    `unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : reason}`
  );
});

process.on("uncaughtException", (error) => {
  log.error(`uncaught exception: ${error.stack || error.message}`);
  process.exit(1);
});

(async () => {
  log.info(
    `starting slackscan api | node=${process.version} | platform=${process.platform} | arch=${process.arch} | pid=${process.pid}`
  );

  const check = await testDb();
  if (!check) {
    log.error("dude where's my database");
    process.exit(1);
  }

  setInterval(pruneHits, RATE_LIMIT_WINDOW_MS).unref();

  server.listen(PORT, () => {
    log.success(`api is locked in on port ${PORT}`);
  });
})();
