import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Quiz } from "./quizzes.js";

const SESSION_MS = 12 * 60 * 60 * 1000;
export const SESSION_COOKIE = "qr_session";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * One demo account, from environment variables. A host who signs in can keep
 * quizzes for the life of the server. Nothing is written to disk.
 */
export class Accounts {
  private sessions = new Map<string, { email: string; expires: number }>();
  private saved = new Map<string, Quiz[]>();

  constructor(
    private email: string | undefined,
    private password: string | undefined,
    private now: () => number = Date.now,
  ) {}

  get enabled(): boolean {
    return Boolean(this.email && this.password);
  }

  /** Returns a session token, or null for a wrong email or password. */
  login(email: string, password: string): string | null {
    if (!this.enabled) return null;
    const emailOk = timingSafeEqual(digest(email.trim().toLowerCase()), digest(this.email!.toLowerCase()));
    const passOk = timingSafeEqual(digest(password), digest(this.password!));
    if (!(emailOk && passOk)) return null;
    this.prune();
    const token = randomBytes(24).toString("hex");
    this.sessions.set(token, { email: this.email!.toLowerCase(), expires: this.now() + SESSION_MS });
    return token;
  }

  /** Drops ended sessions, so they do not pile up in memory. */
  private prune(): void {
    const now = this.now();
    for (const [t, s] of this.sessions) if (s.expires < now) this.sessions.delete(t);
  }

  logout(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }

  userFor(token: string | undefined): string | null {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expires < this.now()) {
      this.sessions.delete(token);
      return null;
    }
    return s.email;
  }

  quizzesOf(email: string | null): Quiz[] {
    return email ? (this.saved.get(email) ?? []) : [];
  }

  /**
   * Keeps a quiz for this account. When the account has `max` quizzes the oldest
   * one is dropped, so saving never fails. The demo account is shared.
   */
  save(email: string, quiz: Quiz, max: number): void {
    const list = [...(this.saved.get(email) ?? []), quiz];
    this.saved.set(email, list.slice(-max));
  }

  /** Removes a saved quiz. Returns false when it is not there. */
  remove(email: string, id: string): boolean {
    const list = this.saved.get(email) ?? [];
    const next = list.filter((q) => q.id !== id);
    this.saved.set(email, next);
    return next.length !== list.length;
  }
}

/** Reads one cookie from a Cookie header. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}
