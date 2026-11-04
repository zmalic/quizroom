import { randomBytes, randomInt } from "node:crypto";
import type { LeaderboardRow, MyResult, Phase, PlayerView, RoomState, Variant } from "../shared/protocol.js";
import type { Question, Quiz } from "./quizzes.js";
import { mulberry32, shuffled } from "./random.js";

/** A refused action. `code` is stable; `message` is for people. */
export class RoomError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RoomLimits {
  maxPlayers: number;
  questionMs: number;
  fastQuestionMs: number;
}

export const DEFAULT_LIMITS: RoomLimits = { maxPlayers: 50, questionMs: 20_000, fastQuestionMs: 10_000 };

const COLORS = ["#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#0284c7", "#4f46e5", "#9333ea", "#c026d3", "#475569"];
const AVATARS = ["🦊", "🐼", "🐸", "🦁", "🐙", "🦉", "🐯", "🐧", "🦄", "🐳"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
export const NICKNAME_MAX = 20;

export function newRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return code;
}

interface Player {
  id: string;
  token: string;
  nickname: string;
  color: string;
  avatar: string;
  score: number;
  connected: boolean;
  choice: number | null;
  answeredAfterMs: number;
  last: MyResult | null;
}

export interface RoomOptions {
  code: string;
  hostName: string;
  quiz: Quiz;
  fast: boolean;
  /** When set, the question order is the same every time. */
  seed?: number;
  v: Variant;
  limits?: RoomLimits;
}

export class Room {
  readonly code: string;
  readonly hostName: string;
  readonly hostToken = randomBytes(16).toString("hex");
  readonly v: Variant;
  readonly fast: boolean;
  readonly quizTitle: string;
  hostConnected = true;
  phase: Phase = "lobby";
  lastActivity = Date.now();

  private questions: Question[];
  private limits: RoomLimits;
  private players = new Map<string, Player>();
  private index = -1;
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private onChange: () => void = () => {};

  constructor(o: RoomOptions) {
    this.code = o.code;
    this.hostName = o.hostName;
    this.v = o.v;
    this.fast = o.fast;
    this.quizTitle = o.quiz.title;
    this.limits = o.limits ?? DEFAULT_LIMITS;
    this.questions = orderQuestions(o.quiz.questions, o.seed);
  }

  /** The room calls this after every change, so the server can push state. */
  setOnChange(f: () => void): void {
    this.onChange = f;
  }

  private changed(): void {
    this.lastActivity = Date.now();
    this.onChange();
  }

  get playerCount(): number {
    return this.players.size;
  }

  private durationMs(): number {
    return this.fast ? this.limits.fastQuestionMs : this.limits.questionMs;
  }

  join(nickname: string): { id: string; token: string } {
    const nick = nickname.trim().replace(/\s+/g, " ");
    if (!nick) throw new RoomError("NICKNAME_REQUIRED", "Enter a nickname.");
    if (nick.length > NICKNAME_MAX) throw new RoomError("NICKNAME_TOO_LONG", `A nickname can have at most ${NICKNAME_MAX} characters.`);
    if (this.phase !== "lobby") throw new RoomError("GAME_STARTED", "This game has already started.");
    if (this.players.size >= this.limits.maxPlayers) throw new RoomError("ROOM_FULL", "This room is full.");
    for (const p of this.players.values()) {
      if (p.nickname.toLowerCase() === nick.toLowerCase()) {
        throw new RoomError("NICKNAME_TAKEN", "That nickname is already taken in this room.");
      }
    }
    const n = this.players.size;
    const p: Player = {
      id: randomBytes(6).toString("hex"),
      token: randomBytes(16).toString("hex"),
      nickname: nick,
      color: COLORS[n % COLORS.length] as string,
      avatar: AVATARS[n % AVATARS.length] as string,
      score: 0,
      connected: true,
      choice: null,
      answeredAfterMs: 0,
      last: null,
    };
    this.players.set(p.id, p);
    this.changed();
    return { id: p.id, token: p.token };
  }

  /**
   * A player leaves. Before the game they are removed from the list. During the
   * game they stay in the scores, marked as away, so the numbers do not jump.
   */
  leave(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.phase === "lobby") {
      this.players.delete(playerId);
      this.changed();
    } else {
      p.token = ""; // the old session cannot come back
      this.setConnected({ role: "player", id: playerId }, false);
    }
  }

  /** Finds who a token belongs to. */
  identify(token: string): { role: "host" } | { role: "player"; id: string } | null {
    if (!token) return null; // a player who left has an empty token
    if (token === this.hostToken) return { role: "host" };
    for (const p of this.players.values()) if (p.token === token) return { role: "player", id: p.id };
    return null;
  }

  setConnected(who: { role: "host" } | { role: "player"; id: string }, connected: boolean): void {
    if (who.role === "host") this.hostConnected = connected;
    else {
      const p = this.players.get(who.id);
      if (p) p.connected = connected;
    }
    this.changed();
    // A player who left should not hold the question open.
    if (!connected && this.phase === "question") this.revealIfAllAnswered();
  }

  start(): void {
    if (this.phase !== "lobby") throw new RoomError("BAD_PHASE", "The game has already started.");
    if (this.players.size === 0) throw new RoomError("NO_PLAYERS", "Wait for at least one player to join.");
    this.nextQuestion();
  }

  next(): void {
    if (this.phase !== "reveal") throw new RoomError("BAD_PHASE", "The question is not finished yet.");
    if (this.index >= this.questions.length - 1) {
      this.phase = "finished";
      this.changed();
      return;
    }
    this.nextQuestion();
  }

  private nextQuestion(): void {
    this.index++;
    this.phase = "question";
    this.startedAt = Date.now();
    for (const p of this.players.values()) {
      p.choice = null;
      p.last = null;
    }
    this.clearTimer();
    this.timer = setTimeout(() => this.reveal(), this.durationMs());
    this.changed();
  }

  answer(playerId: string, choice: number): void {
    const p = this.players.get(playerId);
    if (!p) throw new RoomError("NOT_A_PLAYER", "Only players can answer.");
    if (this.phase !== "question") throw new RoomError("BAD_PHASE", "There is no open question.");
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new RoomError("BAD_CHOICE", "Pick one of the four answers.");
    if (p.choice !== null) throw new RoomError("ALREADY_ANSWERED", "Your answer is locked.");
    p.choice = choice;
    p.answeredAfterMs = Date.now() - this.startedAt;
    this.changed();
    this.revealIfAllAnswered();
  }

  private revealIfAllAnswered(): void {
    const active = [...this.players.values()].filter((p) => p.connected);
    if (active.length > 0 && active.every((p) => p.choice !== null)) this.reveal();
  }

  private reveal(): void {
    if (this.phase !== "question") return;
    this.clearTimer();
    const q = this.current();
    const duration = this.durationMs();
    for (const p of this.players.values()) {
      const correct = p.choice !== null && p.choice === q.correct;
      // 1000 points for an instant answer, down to 500 at the last moment.
      const points = correct ? Math.round(1000 * (1 - Math.min(p.answeredAfterMs / duration, 1) / 2)) : 0;
      p.score += points;
      p.last = { choice: p.choice, correct, points };
    }
    this.phase = "reveal";
    this.changed();
  }

  private current(): Question {
    return this.questions[this.index] as Question;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Stops timers. Call when the room is deleted. */
  dispose(): void {
    this.clearTimer();
    this.onChange = () => {};
  }

  private view(p: Player): PlayerView {
    return {
      id: p.id,
      nickname: p.nickname,
      color: p.color,
      avatar: p.avatar,
      score: p.score,
      answered: p.choice !== null,
      connected: p.connected,
    };
  }

  private leaderboard(): LeaderboardRow[] {
    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    const rows: LeaderboardRow[] = [];
    sorted.forEach((p, i) => {
      // Equal scores share a rank.
      const prev = rows[i - 1];
      const rank = prev && prev.score === p.score ? prev.rank : i + 1;
      rows.push({ rank, id: p.id, nickname: p.nickname, color: p.color, avatar: p.avatar, score: p.score });
    });
    return rows;
  }

  /** What one person is allowed to see. The correct answer stays hidden during a question. */
  stateFor(who: { role: "host" } | { role: "player"; id: string }): RoomState {
    const me = who.role === "player" ? this.players.get(who.id) : undefined;
    const players = [...this.players.values()].map((p) => this.view(p));
    const q = this.phase === "question" || this.phase === "reveal" ? this.current() : null;
    const duration = this.durationMs();
    return {
      code: this.code,
      phase: this.phase,
      v: this.v,
      fast: this.fast,
      quizTitle: this.quizTitle,
      hostName: this.hostName,
      role: who.role,
      you: me ? this.view(me) : null,
      players,
      question: q
        ? {
            index: this.index,
            total: this.questions.length,
            text: q.text,
            answers: [...q.answers],
            durationMs: duration,
            remainingMs: this.phase === "question" ? Math.max(0, duration - (Date.now() - this.startedAt)) : 0,
          }
        : null,
      myChoice: me ? me.choice : null,
      answeredCount: players.filter((p) => p.answered).length,
      reveal:
        this.phase === "reveal" && q
          ? {
              correctIndex: q.correct,
              counts: [0, 1, 2, 3].map((i) => [...this.players.values()].filter((p) => p.choice === i).length),
              myResult: me ? me.last : null,
            }
          : null,
      leaderboard: this.phase === "reveal" || this.phase === "finished" ? this.leaderboard() : [],
      isLastQuestion: this.index >= this.questions.length - 1,
    };
  }
}

/**
 * Puts the questions in order. With a seed the order is the same every time
 * and the answers stay where they are. Without a seed both are shuffled.
 */
export function orderQuestions(questions: Question[], seed?: number): Question[] {
  const rnd = seed === undefined ? Math.random : mulberry32(seed);
  const ordered = shuffled(questions, rnd);
  if (seed !== undefined) return ordered;
  return ordered.map((q) => {
    const idx = shuffled([0, 1, 2, 3], rnd);
    const answers = idx.map((i) => q.answers[i] as string) as Question["answers"];
    return { text: q.text, answers, correct: idx.indexOf(q.correct) };
  });
}
