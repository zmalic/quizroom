import type { Variant } from "../shared/protocol.js";

/**
 * The two looks of the app. Version 2 is the "redesign" used to show
 * self-healing: other texts, other classes and ids, other order. The logic
 * is the same.
 */
export interface Look {
  create: string;
  join: string;
  start: string;
  next: string;
  final: string;
  submitCreate: string;
  submitJoin: string;
  playAgain: string;
  primary: string;
  startId: string;
  nextId: string;
  codeId: string;
  /** Show "Join" before "Create" on the home page. */
  joinFirst: boolean;
}

export const LOOKS: Record<Variant, Look> = {
  1: {
    create: "Create a room",
    join: "Join a room",
    start: "Start game",
    next: "Next question",
    final: "Show final results",
    submitCreate: "Create room",
    submitJoin: "Join",
    playAgain: "Play again",
    primary: "primary",
    startId: "start-game",
    nextId: "next-question",
    codeId: "room-code",
    joinFirst: false,
  },
  2: {
    create: "New room",
    join: "Enter a room",
    start: "Begin",
    next: "Continue",
    final: "See the winners",
    submitCreate: "Open room",
    submitJoin: "Enter",
    playAgain: "Back to start",
    primary: "cta",
    startId: "begin-game",
    nextId: "continue-game",
    codeId: "code-display",
    joinFirst: true,
  },
};
