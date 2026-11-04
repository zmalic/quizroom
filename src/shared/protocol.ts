// Messages between the browser and the server. One JSON object per message.

export type Phase = "lobby" | "question" | "reveal" | "finished";
export type Variant = 1 | 2;

import type { CustomQuiz } from "./validate.js";

export interface QuizInfo {
  id: string;
  title: string;
  questions: number;
  /** True for a quiz kept in the signed-in host's account. */
  mine?: boolean;
}

/** What the browser may send. */
export type ClientMessage =
  | {
      type: "create";
      name: string;
      /** A built-in quiz id, or "mine:<id>" for a saved one. Left out when `custom` is sent. */
      quiz?: string;
      custom?: CustomQuiz;
      /** Keep the custom quiz in the signed-in host's account. */
      save?: boolean;
      fast?: boolean;
      /** Every correct answer is worth 1000 points, so ties can be tested. */
      flat?: boolean;
      seed?: number;
      v?: Variant;
    }
  | { type: "join"; code: string; nickname: string }
  | { type: "resume"; code: string; token: string }
  | { type: "start" }
  | { type: "answer"; choice: number }
  | { type: "next" }
  | { type: "leave" }
  | { type: "delete-quiz"; id: string };

export interface PlayerView {
  id: string;
  nickname: string;
  color: string;
  avatar: string;
  score: number;
  answered: boolean;
  connected: boolean;
}

export interface LeaderboardRow {
  rank: number;
  id: string;
  nickname: string;
  color: string;
  avatar: string;
  score: number;
}

export interface QuestionView {
  index: number;
  total: number;
  text: string;
  answers: string[];
  durationMs: number;
  remainingMs: number;
}

export interface MyResult {
  choice: number | null;
  correct: boolean;
  points: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  v: Variant;
  fast: boolean;
  flat: boolean;
  quizTitle: string;
  hostName: string;
  role: "host" | "player";
  you: PlayerView | null;
  players: PlayerView[];
  question: QuestionView | null;
  /** The player's own choice for the current question, or null. */
  myChoice: number | null;
  answeredCount: number;
  reveal: {
    correctIndex: number;
    /** How many players picked each answer. */
    counts: number[];
    myResult: MyResult | null;
  } | null;
  leaderboard: LeaderboardRow[];
  isLastQuestion: boolean;
}

export type ServerMessage =
  | { type: "hello"; quizzes: QuizInfo[]; auth: { enabled: boolean; user: string | null } }
  | { type: "joined"; token: string; role: "host" | "player" }
  /** The person is out of the room: they left, or the host closed it. */
  | { type: "left"; reason: "left" | "closed" }
  | { type: "state"; state: RoomState }
  | { type: "error"; code: string; message: string };
