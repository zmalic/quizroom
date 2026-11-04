import type { ClientMessage, ServerMessage, Variant } from "../shared/protocol.js";
import { validateQuiz, QUIZ_LIMITS } from "../shared/validate.js";
import type { Accounts } from "./auth.js";
import { config } from "./config.js";
import { findQuiz, quizInfos, type Quiz } from "./quizzes.js";
import { Room, RoomError, newRoomCode, NICKNAME_MAX } from "./room.js";

/** The part of a socket the manager needs. Lets tests use a fake. */
export interface Client {
  send(msg: ServerMessage): void;
  /** Email of the signed-in host, if any. */
  user?: string | null;
}

type Who = { role: "host" } | { role: "player"; id: string };
interface Session {
  room: Room;
  who: Who;
}

/** Owns all rooms and connects messages to them. */
export class Manager {
  private rooms = new Map<string, Room>();
  private sessions = new Map<Client, Session>();
  private sweeper: NodeJS.Timeout;

  constructor(
    private accounts: Accounts | null = null,
    private now: () => number = Date.now,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  /** The first message to a new connection: the quizzes this person can pick, and the sign-in state. */
  hello(client: Client): void {
    const mine: Quiz[] = this.accounts?.quizzesOf(client.user ?? null) ?? [];
    client.send({
      type: "hello",
      quizzes: [...quizInfos(), ...mine.map((q) => ({ id: "mine:" + q.id, title: q.title, questions: q.questions.length, mine: true }))],
      auth: { enabled: Boolean(this.accounts?.enabled), user: client.user ?? null },
    });
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Deletes rooms that have been quiet for too long. */
  sweep(): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (this.now() - room.lastActivity > config.roomTtlMs) {
        this.deleteRoom(code, room);
        removed++;
      }
    }
    return removed;
  }

  private deleteRoom(code: string, room: Room): void {
    room.dispose();
    this.rooms.delete(code);
    for (const [c, s] of this.sessions) if (s.room === room) this.sessions.delete(c);
  }

  stop(): void {
    clearInterval(this.sweeper);
    for (const [code, room] of this.rooms) this.deleteRoom(code, room);
  }

  disconnect(client: Client): void {
    const s = this.sessions.get(client);
    this.sessions.delete(client);
    if (s && this.rooms.get(s.room.code) === s.room) s.room.setConnected(s.who, false);
  }

  handle(client: Client, msg: ClientMessage): void {
    try {
      this.dispatch(client, msg);
    } catch (e) {
      if (e instanceof RoomError) client.send({ type: "error", code: e.code, message: e.message });
      else throw e;
    }
  }

  private dispatch(client: Client, msg: ClientMessage): void {
    switch (msg.type) {
      case "create":
        return this.create(client, msg);
      case "join":
        return this.join(client, msg);
      case "resume":
        return this.resume(client, msg);
    }
    const s = this.sessions.get(client);
    if (!s) throw new RoomError("NOT_IN_ROOM", "Join or create a room first.");
    switch (msg.type) {
      case "start":
        if (s.who.role !== "host") throw new RoomError("HOST_ONLY", "Only the host can do that.");
        return s.room.start();
      case "next":
        if (s.who.role !== "host") throw new RoomError("HOST_ONLY", "Only the host can do that.");
        return s.room.next();
      case "answer":
        if (s.who.role !== "player") throw new RoomError("PLAYER_ONLY", "The host does not answer.");
        return s.room.answer(s.who.id, msg.choice);
    }
  }

  private create(client: Client, msg: Extract<ClientMessage, { type: "create" }>): void {
    const name = String(msg.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) throw new RoomError("NAME_REQUIRED", "Enter your name.");
    if (name.length > NICKNAME_MAX) throw new RoomError("NAME_TOO_LONG", `A name can have at most ${NICKNAME_MAX} characters.`);
    const quiz = this.pickQuiz(client, msg);
    if (this.rooms.size >= config.maxRooms) throw new RoomError("TOO_MANY_ROOMS", "The demo is busy. Try again in a few minutes.");

    let code = newRoomCode();
    while (this.rooms.has(code)) code = newRoomCode();
    const seed = typeof msg.seed === "number" && Number.isFinite(msg.seed) ? Math.trunc(msg.seed) : undefined;
    const v: Variant = msg.v === 2 || msg.v === 1 ? msg.v : config.defaultVariant;
    const room = new Room({
      code,
      hostName: name,
      quiz,
      fast: msg.fast === true,
      seed,
      v,
      limits: { maxPlayers: config.maxPlayers, questionMs: config.questionMs, fastQuestionMs: config.fastQuestionMs },
    });
    room.setOnChange(() => this.push(room));
    this.rooms.set(code, room);
    this.attach(client, room, { role: "host" }, room.hostToken);
  }

  private pickQuiz(client: Client, msg: Extract<ClientMessage, { type: "create" }>): Quiz {
    if (msg.custom !== undefined) {
      const check = validateQuiz(msg.custom);
      if (!check.ok) throw new RoomError("QUIZ_INVALID", check.error);
      const quiz: Quiz = { id: "c" + Math.random().toString(36).slice(2, 10), title: check.quiz.title, questions: check.quiz.questions.map((q) => ({ text: q.text, answers: q.answers as Quiz["questions"][number]["answers"], correct: q.correct })) };
      if (msg.save) {
        if (!client.user || !this.accounts) throw new RoomError("SIGN_IN_REQUIRED", "Sign in to keep a quiz.");
        if (!this.accounts.save(client.user, quiz, QUIZ_LIMITS.savedPerAccount)) {
          throw new RoomError("TOO_MANY_QUIZZES", `You can keep at most ${QUIZ_LIMITS.savedPerAccount} quizzes.`);
        }
        this.hello(client);
      }
      return quiz;
    }
    const id = String(msg.quiz ?? "");
    const quiz = id.startsWith("mine:")
      ? this.accounts?.quizzesOf(client.user ?? null).find((q) => "mine:" + q.id === id)
      : findQuiz(id);
    if (!quiz) throw new RoomError("QUIZ_NOT_FOUND", "Pick a quiz set.");
    return quiz;
  }

  private join(client: Client, msg: Extract<ClientMessage, { type: "join" }>): void {
    const room = this.rooms.get(String(msg.code ?? "").trim().toUpperCase());
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "There is no room with that code.");
    const p = room.join(String(msg.nickname ?? ""));
    this.attach(client, room, { role: "player", id: p.id }, p.token);
  }

  private resume(client: Client, msg: Extract<ClientMessage, { type: "resume" }>): void {
    const room = this.rooms.get(String(msg.code ?? "").trim().toUpperCase());
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "This room does not exist any more.");
    const who = room.identify(String(msg.token ?? ""));
    if (!who) throw new RoomError("BAD_TOKEN", "This session is not valid any more.");
    this.attach(client, room, who, String(msg.token));
  }

  private attach(client: Client, room: Room, who: Who, token: string): void {
    this.sessions.set(client, { room, who });
    client.send({ type: "joined", token, role: who.role });
    room.setConnected(who, true); // pushes state to everyone, including this client
  }

  private push(room: Room): void {
    for (const [client, s] of this.sessions) {
      if (s.room === room) client.send({ type: "state", state: room.stateFor(s.who) });
    }
  }
}
