// The rules for a quiz written by a person. The browser uses them to show a
// message before sending, the server uses them again because it cannot trust the browser.

export interface CustomQuestion {
  text: string;
  answers: string[];
  correct: number;
}

export interface CustomQuiz {
  title: string;
  questions: CustomQuestion[];
}

export const QUIZ_LIMITS = { title: 60, questions: 10, text: 200, answer: 80, savedPerAccount: 10 };

export type QuizCheck = { ok: true; quiz: CustomQuiz } | { ok: false; error: string };

/** Checks a quiz and returns it cleaned (trimmed), or the first problem in plain words. */
export function validateQuiz(input: unknown): QuizCheck {
  const bad = (error: string): QuizCheck => ({ ok: false, error });
  if (!input || typeof input !== "object") return bad("The quiz is missing.");
  const q = input as { title?: unknown; questions?: unknown };

  const title = typeof q.title === "string" ? q.title.trim() : "";
  if (!title) return bad("Give the quiz a title.");
  if (title.length > QUIZ_LIMITS.title) return bad(`The title can have at most ${QUIZ_LIMITS.title} characters.`);

  if (!Array.isArray(q.questions) || q.questions.length === 0) return bad("Add at least one question.");
  if (q.questions.length > QUIZ_LIMITS.questions) return bad(`A quiz can have at most ${QUIZ_LIMITS.questions} questions.`);

  const questions: CustomQuestion[] = [];
  for (const [i, raw] of q.questions.entries()) {
    const n = i + 1;
    const r = (raw ?? {}) as { text?: unknown; answers?: unknown; correct?: unknown };
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!text) return bad(`Question ${n} needs a text.`);
    if (text.length > QUIZ_LIMITS.text) return bad(`Question ${n}: the text can have at most ${QUIZ_LIMITS.text} characters.`);
    if (!Array.isArray(r.answers) || r.answers.length !== 4) return bad(`Question ${n} needs four answers.`);
    const answers = r.answers.map((a) => (typeof a === "string" ? a.trim() : ""));
    if (answers.some((a) => !a)) return bad(`Question ${n}: fill in all four answers.`);
    if (answers.some((a) => a.length > QUIZ_LIMITS.answer)) return bad(`Question ${n}: an answer can have at most ${QUIZ_LIMITS.answer} characters.`);
    if (new Set(answers.map((a) => a.toLowerCase())).size !== 4) return bad(`Question ${n}: the four answers must be different.`);
    if (!Number.isInteger(r.correct) || (r.correct as number) < 0 || (r.correct as number) > 3) {
      return bad(`Question ${n}: mark the correct answer.`);
    }
    questions.push({ text, answers, correct: r.correct as number });
  }
  return { ok: true, quiz: { title, questions } };
}
