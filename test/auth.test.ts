import { describe, expect, it } from "vitest";
import { Accounts, cookieValue } from "../src/server/auth.js";

describe("Accounts", () => {
  it("is off without settings", () => {
    const a = new Accounts(undefined, undefined);
    expect(a.enabled).toBe(false);
    expect(a.login("a@b.c", "x")).toBeNull();
  });

  it("signs in with the right email and password only", () => {
    const a = new Accounts("Demo@Example.com", "secret");
    expect(a.login("demo@example.com", "wrong")).toBeNull();
    expect(a.login("other@example.com", "secret")).toBeNull();
    const t = a.login(" DEMO@example.com ", "secret")!;
    expect(a.userFor(t)).toBe("demo@example.com");
    a.logout(t);
    expect(a.userFor(t)).toBeNull();
  });

  it("ends a session after 12 hours", () => {
    let now = 1_000;
    const a = new Accounts("d@e.f", "p", () => now);
    const t = a.login("d@e.f", "p")!;
    now += 12 * 3600_000 + 1;
    expect(a.userFor(t)).toBeNull();
  });

  it("keeps the newest quizzes when the account is full, and can delete one", () => {
    const a = new Accounts("d@e.f", "p");
    const q = (id: string) => ({ id, title: id, questions: [] });
    for (const id of ["1", "2", "3"]) a.save("d@e.f", q(id), 2);
    expect(a.quizzesOf("d@e.f").map((x) => x.id)).toEqual(["2", "3"]);
    expect(a.remove("d@e.f", "2")).toBe(true);
    expect(a.remove("d@e.f", "2")).toBe(false);
    expect(a.quizzesOf("d@e.f").map((x) => x.id)).toEqual(["3"]);
    expect(a.quizzesOf(null)).toEqual([]);
  });
});

describe("cookieValue", () => {
  it("finds one cookie", () => {
    expect(cookieValue("a=1; qr_session=abc=; b=2", "qr_session")).toBe("abc=");
    expect(cookieValue(undefined, "x")).toBeUndefined();
  });
});
