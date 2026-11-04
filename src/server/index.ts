import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage } from "../shared/protocol.js";
import { config } from "./config.js";
import { Manager } from "./manager.js";
import { quizInfos } from "./quizzes.js";

const here = dirname(fileURLToPath(import.meta.url));
// From dist/ the folder is ../public; from src/server/ (tests) it is ../../public.
const publicDir =
  process.env.PUBLIC_DIR ?? [join(here, "..", "public"), join(here, "..", "..", "public")].find((d) => existsSync(join(d, "index.html"))) ?? join(here, "..", "public");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** Address of the client. Behind a proxy it is the first entry of X-Forwarded-For. */
function clientAddress(req: IncomingMessage): string {
  const fly = req.headers["fly-client-ip"];
  if (typeof fly === "string") return fly;
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/** A simple counter per address and minute. */
class RateLimit {
  private hits = new Map<string, { windowStart: number; n: number }>();
  constructor(private max: number) {}
  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.windowStart >= 60_000) {
      this.hits.set(key, { windowStart: now, n: 1 });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    h.n++;
    return h.n <= this.max;
  }
  private prune(now: number): void {
    for (const [k, h] of this.hits) if (now - h.windowStart >= 60_000) this.hits.delete(k);
  }
}

async function serveFile(res: ServerResponse, path: string, status = 200): Promise<void> {
  try {
    const body = await readFile(path);
    res.writeHead(status, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-cache", ...SECURITY_HEADERS });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY_HEADERS });
    res.end("Not found");
  }
}

export function start(port = config.port) {
  const manager = new Manager();
  const limit = new RateLimit(config.actionsPerMinute);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: manager.roomCount }));
      return;
    }
    // A join link looks like /r/ABC234. The page reads the code from the address.
    if (url.pathname === "/" || /^\/r\/[A-Za-z0-9]{1,12}$/.test(url.pathname)) {
      return serveFile(res, join(publicDir, "index.html"));
    }
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    const file = join(publicDir, rel);
    if (!file.startsWith(publicDir + sep)) {
      res.writeHead(403, SECURITY_HEADERS);
      res.end("Forbidden");
      return;
    }
    return serveFile(res, file);
  });

  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
  wss.on("connection", (ws: WebSocket, req) => {
    const address = clientAddress(req);
    const client = { send: (m: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)) };
    let alive = true;
    ws.on("pong", () => (alive = true));
    const beat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30_000);

    client.send({ type: "hello", quizzes: quizInfos() });

    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return client.send({ type: "error", code: "BAD_MESSAGE", message: "Could not read that message." });
      }
      if (!msg || typeof msg !== "object" || typeof (msg as { type?: unknown }).type !== "string") {
        return client.send({ type: "error", code: "BAD_MESSAGE", message: "Could not read that message." });
      }
      if ((msg.type === "create" || msg.type === "join") && !limit.allow(address)) {
        return client.send({ type: "error", code: "RATE_LIMITED", message: "Too many tries. Wait a minute and try again." });
      }
      manager.handle(client, msg);
    });
    ws.on("close", () => {
      clearInterval(beat);
      manager.disconnect(client);
    });
    ws.on("error", () => ws.terminate());
  });

  server.listen(port, () => console.log(`QuizRoom listening on :${port}`));
  const stop = () =>
    new Promise<void>((resolve) => {
      manager.stop();
      for (const c of wss.clients) c.terminate();
      wss.close(() => server.close(() => resolve()));
    });
  return { server, manager, stop };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = start();
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => app.stop().then(() => process.exit(0)));
}
