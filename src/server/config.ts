function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  port: num("PORT", 3000),
  maxRooms: num("MAX_ROOMS", 200),
  maxPlayers: num("MAX_PLAYERS", 50),
  /** A room with no activity for this long is deleted. */
  roomTtlMs: num("ROOM_TTL_MINUTES", 60) * 60_000,
  questionMs: num("QUESTION_SECONDS", 20) * 1000,
  fastQuestionMs: num("FAST_QUESTION_SECONDS", 10) * 1000,
  /** Rooms created or joined per client address in one minute. Generous on purpose:
   * test runners open many browsers from one address. */
  actionsPerMinute: num("ACTIONS_PER_MINUTE", 300),
  /** "2" makes every new room use the redesigned interface. */
  defaultVariant: process.env.UI_VARIANT === "2" ? (2 as const) : (1 as const),
};
