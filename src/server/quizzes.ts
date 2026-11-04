import type { QuizInfo } from "../shared/protocol.js";

export interface Question {
  text: string;
  answers: [string, string, string, string];
  /** Index of the correct answer in `answers`. */
  correct: number;
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
}

/** Built-in quiz sets. Short, neutral and friendly. */
export const QUIZZES: Quiz[] = [
  {
    id: "web-basics",
    title: "Web basics",
    questions: [
      { text: "What does HTML stand for?", answers: ["HyperText Markup Language", "High Tech Modern Language", "Hyperlink and Text Markup Logic", "Home Tool Markup Language"], correct: 0 },
      { text: "Which tag makes a link?", answers: ["<link>", "<a>", "<href>", "<url>"], correct: 1 },
      { text: "What does CSS control?", answers: ["The database", "The server speed", "How a page looks", "The browser history"], correct: 2 },
      { text: "Which protocol keeps a web page and a server talking in real time?", answers: ["FTP", "SMTP", "SSH", "WebSocket"], correct: 3 },
      { text: "What is the default port of HTTPS?", answers: ["443", "80", "8080", "21"], correct: 0 },
    ],
  },
  {
    id: "general-knowledge",
    title: "General knowledge",
    questions: [
      { text: "Which planet is closest to the Sun?", answers: ["Venus", "Mercury", "Mars", "Earth"], correct: 1 },
      { text: "How many continents are there?", answers: ["Five", "Six", "Seven", "Eight"], correct: 2 },
      { text: "What is the largest ocean?", answers: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3 },
      { text: "Which animal is known as the king of the jungle?", answers: ["Lion", "Tiger", "Elephant", "Bear"], correct: 0 },
      { text: "How many minutes are in two hours?", answers: ["100", "120", "90", "150"], correct: 1 },
    ],
  },
];

export function quizInfos(): QuizInfo[] {
  return QUIZZES.map((q) => ({ id: q.id, title: q.title, questions: q.questions.length }));
}

export function findQuiz(id: string): Quiz | undefined {
  return QUIZZES.find((q) => q.id === id);
}
