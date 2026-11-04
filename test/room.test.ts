import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUIZZES } from "../src/server/quizzes.js";
import { Room, RoomError, orderQuestions } from "../src/server/room.js";

const quiz = QUIZZES[0]!;

function make(over: Partial<ConstructorParameters<typeof Room>[0]> = {}): Room {
  return new Room({ code: "ABC234", hostName: "Hana", quiz, fast: false, seed: 1, v: 1, ...over });
}

function code(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof RoomError) return e.code;
    throw e;
  }
  return "";
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("joining", () => {
  it("refuses empty, long and duplicate nicknames", () => {
    const r = make();
    expect(code(() => r.join("  "))).toBe("NICKNAME_REQUIRED");
    expect(code(() => r.join("x".repeat(21)))).toBe("NICKNAME_TOO_LONG");
    r.join("Ana");
    expect(code(() => r.join("ana"))).toBe("NICKNAME_TAKEN");
  });

  it("refuses players after the start and when full", () => {
    const r = make({ limits: { maxPlayers: 1, questionMs: 20000, fastQuestionMs: 10000 } });
    r.join("Ana");
    expect(code(() => r.join("Bo"))).toBe("ROOM_FULL");
    r.start();
    expect(code(() => r.join("Cy"))).toBe("GAME_STARTED");
  });

  it("cannot start without players", () => {
    expect(code(() => make().start())).toBe("NO_PLAYERS");
  });
});

describe("a game", () => {
  it("hides the correct answer during the question and shows it after", () => {
    const r = make();
    const a = r.join("Ana");
    r.start();
    expect(r.stateFor({ role: "player", id: a.id }).reveal).toBeNull();
    r.answer(a.id, 0);
    const s = r.stateFor({ role: "host" });
    expect(s.phase).toBe("reveal");
    expect(s.reveal?.correctIndex).toBeTypeOf("number");
  });

  it("scores faster answers higher and wrong answers zero", () => {
    const r = make();
    const fast = r.join("Fast");
    const slow = r.join("Slow");
    const wrong = r.join("Wrong");
    r.start();
    const correct = orderQuestions(quiz.questions, 1)[0]!.correct;
    const other = (correct + 1) % 4;
    r.answer(fast.id, correct); // instantly: 1000
    vi.advanceTimersByTime(10_000);
    r.answer(slow.id, correct); // halfway: 750
    r.answer(wrong.id, other);
    const rows = r.stateFor({ role: "host" }).leaderboard;
    expect(rows.map((x) => [x.nickname, x.score])).toEqual([["Fast", 1000], ["Slow", 750], ["Wrong", 0]]);
  });

  it("closes the question when the time is up", () => {
    const r = make();
    r.join("Ana");
    r.start();
    vi.advanceTimersByTime(20_000);
    expect(r.phase).toBe("reveal");
    expect(r.stateFor({ role: "host" }).reveal?.counts).toEqual([0, 0, 0, 0]);
  });

  it("uses a shorter time in fast mode", () => {
    const r = make({ fast: true });
    r.join("Ana");
    r.start();
    vi.advanceTimersByTime(10_000);
    expect(r.phase).toBe("reveal");
  });

  it("locks the first answer", () => {
    const r = make();
    r.join("Ana");
    const b = r.join("Bo");
    r.start();
    r.answer(b.id, 1);
    expect(code(() => r.answer(b.id, 2))).toBe("ALREADY_ANSWERED");
  });

  it("does not wait for a player who left", () => {
    const r = make();
    const a = r.join("Ana");
    const b = r.join("Bo");
    r.start();
    r.answer(a.id, 0);
    r.setConnected({ role: "player", id: b.id }, false);
    expect(r.phase).toBe("reveal");
  });

  it("goes through every question to the final results", () => {
    const r = make();
    const a = r.join("Ana");
    r.start();
    for (let i = 0; i < quiz.questions.length; i++) {
      expect(r.stateFor({ role: "host" }).question?.index).toBe(i);
      r.answer(a.id, 0);
      expect(r.stateFor({ role: "host" }).isLastQuestion).toBe(i === quiz.questions.length - 1);
      r.next();
    }
    expect(r.phase).toBe("finished");
    expect(r.stateFor({ role: "host" }).leaderboard).toHaveLength(1);
  });

  it("gives equal scores the same rank", () => {
    const r = make();
    const a = r.join("Ana");
    const b = r.join("Bo");
    r.start();
    const correct = orderQuestions(quiz.questions, 1)[0]!.correct;
    r.answer(a.id, correct); // both instantly, so the same points
    r.answer(b.id, correct);
    const ranks = r.stateFor({ role: "host" }).leaderboard.map((x) => x.rank);
    expect(ranks).toEqual([1, 1]);
  });
});

describe("flat points", () => {
  it("gives every correct answer 1000 points, however late, so ties are easy to test", () => {
    const r = make({ flat: true });
    const a = r.join("Ana");
    const b = r.join("Bo");
    r.start();
    const correct = orderQuestions(quiz.questions, 1)[0]!.correct;
    r.answer(a.id, correct);
    vi.advanceTimersByTime(15_000);
    r.answer(b.id, correct);
    expect(r.stateFor({ role: "host" }).leaderboard.map((x) => [x.rank, x.score])).toEqual([[1, 1000], [1, 1000]]);
  });
});

describe("leaving", () => {
  it("removes a player in the lobby and keeps the score during a game", () => {
    const r = make();
    const a = r.join("Ana");
    const b = r.join("Bo");
    r.leave(a.id);
    expect(r.playerCount).toBe(1);
    r.start();
    r.leave(b.id);
    expect(r.playerCount).toBe(1);
    expect(r.stateFor({ role: "host" }).players[0]!.connected).toBe(false);
    expect(r.identify(b.token)).toBeNull(); // the old session cannot come back
    expect(r.identify("")).toBeNull();
  });
});

describe("question order", () => {
  it("is the same with the same seed and keeps answers in place", () => {
    const a = orderQuestions(quiz.questions, 123);
    const b = orderQuestions(quiz.questions, 123);
    expect(a).toEqual(b);
    const original = quiz.questions.find((q) => q.text === a[0]!.text)!;
    expect(a[0]!.answers).toEqual(original.answers);
  });

  it("keeps the correct answer correct when answers are shuffled", () => {
    for (let i = 0; i < 20; i++) {
      for (const q of orderQuestions(quiz.questions)) {
        const original = quiz.questions.find((o) => o.text === q.text)!;
        expect(q.answers[q.correct]).toBe(original.answers[original.correct]);
      }
    }
  });
});
