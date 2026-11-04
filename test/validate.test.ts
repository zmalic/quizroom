import { describe, expect, it } from "vitest";
import { validateQuiz } from "../src/shared/validate.js";

const q = (over = {}) => ({ text: "2 + 2?", answers: ["3", "4", "5", "6"], correct: 1, ...over });
const quiz = (over = {}) => ({ title: "Maths", questions: [q()], ...over });
const error = (x: unknown) => {
  const r = validateQuiz(x);
  return r.ok ? "" : r.error;
};

describe("validateQuiz", () => {
  it("accepts a good quiz and trims it", () => {
    const r = validateQuiz(quiz({ title: "  Maths  " }));
    expect(r.ok && r.quiz.title).toBe("Maths");
  });

  it("explains each problem in plain words", () => {
    expect(error(null)).toMatch(/missing/);
    expect(error(quiz({ title: " " }))).toBe("Give the quiz a title.");
    expect(error(quiz({ title: "x".repeat(61) }))).toMatch(/at most 60/);
    expect(error(quiz({ questions: [] }))).toBe("Add at least one question.");
    expect(error(quiz({ questions: Array(11).fill(q()) }))).toMatch(/at most 10 questions/);
    expect(error(quiz({ questions: [q(), q({ text: "" })] }))).toBe("Question 2 needs a text.");
    expect(error(quiz({ questions: [q({ answers: ["a", "b", "c"] })] }))).toBe("Question 1 needs four answers.");
    expect(error(quiz({ questions: [q({ answers: ["a", "b", "c", " "] })] }))).toBe("Question 1: fill in all four answers.");
    expect(error(quiz({ questions: [q({ answers: ["a", "A", "c", "d"] })] }))).toBe("Question 1: the four answers must be different.");
    expect(error(quiz({ questions: [q({ correct: -1 })] }))).toBe("Question 1: mark the correct answer.");
    expect(error(quiz({ questions: [q({ correct: 4 })] }))).toBe("Question 1: mark the correct answer.");
  });
});
