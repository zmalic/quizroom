import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { RoomState, ServerMessage } from "../src/shared/protocol.js";
import { Accounts } from "../src/server/auth.js";
import { start } from "../src/server/index.js";

let app: ReturnType<typeof start>;
let port: number;

beforeAll(async () => {
  app = start(0, new Accounts("demo@example.com", "s3cret"));
  await new Promise((r) => app.server.once("listening", r));
  port = (app.server.address() as { port: number }).port;
});
afterAll(() => app.stop());

class Peer {
  ws: WebSocket;
  state: RoomState | null = null;
  errors: string[] = [];
  token = "";
  private waiters: (() => void)[] = [];
  hello: Extract<ServerMessage, { type: "hello" }> | null = null;
  constructor(cookie?: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, cookie ? { headers: { cookie } } : undefined);
    this.ws.on("message", (d) => {
      const m = JSON.parse(d.toString()) as ServerMessage;
      if (m.type === "state") this.state = m.state;
      if (m.type === "hello") this.hello = m;
      if (m.type === "error") this.errors.push(m.code);
      if (m.type === "joined") this.token = m.token;
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  open = () => new Promise<void>((r) => this.ws.once("open", () => r()));
  send = (m: object) => this.ws.send(JSON.stringify(m));
  /** Waits until the condition holds on the latest state. */
  async until(f: (s: RoomState) => boolean, ms = 3000): Promise<RoomState> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.state && f(this.state)) return this.state;
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
    throw new Error("timeout; last state: " + JSON.stringify(this.state?.phase));
  }
}

async function peer(cookie?: string): Promise<Peer> {
  const p = new Peer(cookie);
  await p.open();
  return p;
}

describe("scenario: host and four players", () => {
  it("everyone sees the same question and the same leaderboard", async () => {
    const host = await peer();
    host.send({ type: "create", name: "Hana", quiz: "web-basics", seed: 7 });
    const lobby = await host.until((s) => s.phase === "lobby");

    const players: Peer[] = [];
    for (const nick of ["Ana", "Bo", "Cy", "Di"]) {
      const p = await peer();
      p.send({ type: "join", code: lobby.code, nickname: nick });
      await p.until((s) => s.players.length >= 1);
      players.push(p);
    }
    await host.until((s) => s.players.length === 4);

    host.send({ type: "start" });
    const states = await Promise.all(players.map((p) => p.until((s) => s.phase === "question")));
    const texts = new Set(states.map((s) => s.question!.text));
    expect(texts.size).toBe(1);
    expect(states[0]!.reveal).toBeNull(); // the answer is not sent during the question

    for (const [i, p] of players.entries()) p.send({ type: "answer", choice: i });
    const after = await Promise.all(players.map((p) => p.until((s) => s.phase === "reveal")));
    const boards = new Set(after.map((s) => JSON.stringify(s.leaderboard)));
    expect(boards.size).toBe(1);
    expect(after[0]!.leaderboard).toHaveLength(4);

    host.send({ type: "next" });
    await host.until((s) => s.phase === "question" && s.question!.index === 1);
  });

  it("lets a player come back with the saved token", async () => {
    const host = await peer();
    host.send({ type: "create", name: "Hana", quiz: "general-knowledge" });
    const lobby = await host.until((s) => s.phase === "lobby");
    const p = await peer();
    p.send({ type: "join", code: lobby.code, nickname: "Ana" });
    await p.until((s) => s.you !== null);
    const token = p.token;
    p.ws.close();
    await host.until((s) => s.players[0]?.connected === false);
    const again = await peer();
    again.send({ type: "resume", code: lobby.code, token });
    const s = await again.until((st) => st.you?.nickname === "Ana");
    expect(s.you?.connected).toBe(true);
  });

  it("refuses a bad code and a player who tries to start", async () => {
    const p = await peer();
    p.send({ type: "join", code: "ZZZZZZ", nickname: "Ana" });
    await new Promise((r) => setTimeout(r, 100));
    expect(p.errors).toContain("ROOM_NOT_FOUND");

    const host = await peer();
    host.send({ type: "create", name: "Hana", quiz: "web-basics" });
    const lobby = await host.until((s) => s.phase === "lobby");
    const q = await peer();
    q.send({ type: "join", code: lobby.code, nickname: "Bo" });
    await q.until((s) => s.you !== null);
    q.send({ type: "start" });
    await new Promise((r) => setTimeout(r, 100));
    expect(q.errors).toContain("HOST_ONLY");
  });
});

describe("leaving a room", () => {
  it("lets a player leave, and closes the room for everyone when the host leaves", async () => {
    const host = await peer();
    host.send({ type: "create", name: "Hana", quiz: "web-basics" });
    const lobby = await host.until((s) => s.phase === "lobby");
    const a = await peer();
    a.send({ type: "join", code: lobby.code, nickname: "Ana" });
    const b = await peer();
    b.send({ type: "join", code: lobby.code, nickname: "Bo" });
    await host.until((s) => s.players.length === 2);

    a.send({ type: "leave" });
    await host.until((s) => s.players.length === 1);

    const gone: string[] = [];
    b.ws.on("message", (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === "left") gone.push(m.reason);
    });
    host.send({ type: "leave" });
    await new Promise((r) => setTimeout(r, 150));
    expect(gone).toEqual(["closed"]);
    const again = await peer();
    again.send({ type: "join", code: lobby.code, nickname: "Cy" });
    await new Promise((r) => setTimeout(r, 100));
    expect(again.errors).toContain("ROOM_NOT_FOUND");
  });

  it("deletes a saved quiz", async () => {
    const base = `http://127.0.0.1:${port}`;
    const ok = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "demo@example.com", password: "s3cret" }) });
    const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
    const p = await peer(cookie);
    p.send({ type: "create", name: "Hana", save: true, custom: { title: "To delete", questions: [{ text: "Q?", answers: ["a", "b", "c", "d"], correct: 0 }] } });
    await p.until((s) => s.phase === "lobby");
    const before = p.hello!.quizzes.find((x) => x.title === "To delete")!;
    p.send({ type: "delete-quiz", id: before.id });
    await new Promise((r) => setTimeout(r, 100));
    expect(p.hello!.quizzes.find((x) => x.title === "To delete")).toBeUndefined();
  });
});

describe("one connection, two rooms", () => {
  it("leaves the first room when the same connection creates another", async () => {
    const host = await peer();
    host.send({ type: "create", name: "Hana", quiz: "web-basics" });
    const first = await host.until((s) => s.phase === "lobby");
    const p = await peer();
    p.send({ type: "join", code: first.code, nickname: "Ana" });
    await p.until((s) => s.players.length === 1);
    p.send({ type: "create", name: "Ana", quiz: "web-basics" });
    await p.until((s) => s.code !== first.code);
    const after = await host.until((s) => s.players[0]?.connected === false);
    expect(after.players[0]?.nickname).toBe("Ana");
  });
});

describe("serving", () => {
  it("serves the page, join links and a health check, and nothing outside public", async () => {
    const base = `http://127.0.0.1:${port}`;
    expect((await fetch(base + "/")).status).toBe(200);
    expect((await fetch(base + "/r/ABC234")).headers.get("content-type")).toContain("text/html");
    expect((await fetch(base + "/healthz")).status).toBe(200);
    // A broken escape must not stop the server.
    expect((await fetch(base + "/%E0%A4%A")).status).toBe(400);
    expect((await fetch(base + "/healthz")).status).toBe(200);
    expect((await fetch(base + "/theme.js")).status).toBe(200);
    const escape = await fetch(base + "/..%2F..%2Fpackage.json");
    expect(escape.status).toBe(404); // never the real package.json
    expect(await escape.text()).not.toContain("quizroom");
  });
});

describe("custom quizzes and sign-in", () => {
  const body = { title: "My quiz", questions: [{ text: "Pick B", answers: ["a", "b", "c", "d"], correct: 1 }] };

  const signIn = async () => {
    const ok = await fetch(`http://127.0.0.1:${port}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "demo@example.com", password: "s3cret" }) });
    return ok.headers.get("set-cookie")!.split(";")[0]!;
  };

  it("refuses a custom quiz from a host who is not signed in", async () => {
    const anon = await peer();
    anon.send({ type: "create", name: "Hana", custom: body });
    await new Promise((r) => setTimeout(r, 100));
    expect(anon.errors).toContain("SIGN_IN_REQUIRED");
    expect(anon.state).toBeNull();
  });

  it("plays a custom quiz and refuses a bad one with a clear message", async () => {
    const cookie = await signIn();
    const bad = await peer(cookie);
    bad.send({ type: "create", name: "Hana", custom: { ...body, title: "" } });
    await new Promise((r) => setTimeout(r, 100));
    expect(bad.errors).toContain("QUIZ_INVALID");

    const host = await peer(cookie);
    host.send({ type: "create", name: "Hana", custom: body });
    const lobby = await host.until((s) => s.phase === "lobby");
    expect(lobby.quizTitle).toBe("My quiz");
    const p = await peer();
    p.send({ type: "join", code: lobby.code, nickname: "Ana" });
    await p.until((s) => s.you !== null);
    host.send({ type: "start" });
    const q = await p.until((s) => s.phase === "question");
    expect(q.question!.text).toBe("Pick B");
  });

  it("rejects a wrong password, then keeps a quiz for the signed-in host", async () => {
    const base = `http://127.0.0.1:${port}`;
    const post = (pw: string) =>
      fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "demo@example.com", password: pw }) });
    expect((await post("nope")).status).toBe(401);
    const ok = await post("s3cret");
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;

    const anon = await peer();
    await anon.until(() => true).catch(() => {});
    anon.send({ type: "create", name: "Hana", custom: body, save: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(anon.errors).toContain("SIGN_IN_REQUIRED");

    const host = await peer(cookie);
    host.send({ type: "create", name: "Hana", custom: body, save: true });
    await host.until((s) => s.phase === "lobby");
    expect(host.hello?.auth.user).toBe("demo@example.com");

    const again = await peer(cookie);
    await new Promise((r) => setTimeout(r, 100));
    const mine = again.hello!.quizzes.find((x) => x.mine);
    expect(mine?.title).toBe("My quiz");
    again.send({ type: "create", name: "Hana", quiz: mine!.id });
    expect((await again.until((s) => s.phase === "lobby")).quizTitle).toBe("My quiz");
  });
});
