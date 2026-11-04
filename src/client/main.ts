import type { ClientMessage, QuizInfo, RoomState, ServerMessage, Variant } from "../shared/protocol.js";
import { LOOKS, type Look } from "./copy.js";
import { validateQuiz, QUIZ_LIMITS, type CustomQuestion } from "../shared/validate.js";
import { h } from "./dom.js";

const SHAPES = ["▲", "◆", "●", "■"];
const SESSION_KEY = "quizroom-session";

type Screen = "home" | "create" | "join" | "signin" | "builder";

let ws: WebSocket | null = null;
let quizzes: QuizInfo[] = [];
let state: RoomState | null = null;
let screen: Screen = location.pathname.startsWith("/r/") ? "join" : "home";
let error = "";
let connected = false;
let auth: { enabled: boolean; user: string | null } = { enabled: false, user: null };
let reconnectDelay = 1000;

interface Draft {
  title: string;
  questions: CustomQuestion[];
  save: boolean;
}
const emptyQuestion = (): CustomQuestion => ({ text: "", answers: ["", "", "", ""], correct: -1 });
let draft: Draft = { title: "", questions: [emptyQuestion()], save: false };
const credentials = { email: "", password: "" };
let deadline = 0;
let ticker: number | undefined;
const form = { name: "", quiz: "", code: (location.pathname.split("/")[2] ?? "").toUpperCase(), nickname: "" };

const params = new URLSearchParams(location.search);

/** Looks and test switches come from the address: ?v=2 &fast=1 &seed=123 */
function urlVariant(): Variant {
  let v = params.get("v");
  try {
    if (v) sessionStorage.setItem("quizroom-v", v);
    else v = sessionStorage.getItem("quizroom-v");
  } catch {}
  return v === "2" ? 2 : 1;
}

function saved(): { code: string; token: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}
function save(s: { code: string; token: string } | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function send(m: ClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function connect(): void {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => {
    connected = true;
    const s = saved();
    if (s) send({ type: "resume", code: s.code, token: s.token });
    render();
  };
  ws.onclose = () => {
    connected = false;
    render();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = 1000;
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data) as ServerMessage);
}

function onMessage(m: ServerMessage): void {
  switch (m.type) {
    case "hello":
      quizzes = m.quizzes;
      auth = m.auth;
      if (!quizzes.some((q) => q.id === form.quiz)) form.quiz = quizzes[0]?.id ?? "";
      break;
    case "joined":
      error = "";
      save({ code: "", token: m.token }); // the code arrives with the first state
      break;
    case "state":
      state = m.state;
      error = "";
      deadline = performance.now() + (m.state.question?.remainingMs ?? 0);
      save({ code: m.state.code, token: saved()?.token ?? "" });
      break;
    case "error":
      error = m.message;
      if (m.code === "ROOM_NOT_FOUND" && saved()) save(null);
      if (m.code === "BAD_TOKEN") save(null);
      break;
  }
  render();
}

function look(): Look {
  return LOOKS[state ? state.v : urlVariant()];
}

// ---- screens ---------------------------------------------------------

function shell(...content: (Node | false | null)[]): HTMLElement {
  const toggle = h(
    "button",
    {
      class: "quiet",
      type: "button",
      "aria-label": "Switch between light and dark theme",
      onclick: () => {
        const dark = matchMedia("(prefers-color-scheme: dark)").matches;
        const cur = document.documentElement.getAttribute("data-theme") ?? (dark ? "dark" : "light");
        const next = cur === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem("theme", next);
        } catch {}
      },
    },
    "Theme",
  );
  const account =
    state || !auth.enabled || (screen === "signin" && !auth.user)
      ? null
      : auth.user
        ? h(
            "span",
            { class: "account" },
            h("span", { class: "muted" }, `Signed in as ${auth.user}`),
            h("button", { class: "quiet", type: "button", onclick: signOut }, "Sign out"),
          )
        : h("button", { class: "quiet", type: "button", onclick: () => go("signin") }, "Sign in");
  return h(
    "div",
    { class: "page" },
    h("header", { class: "topbar" }, h("a", { class: "brand", href: "/" }, "Quiz", h("span", {}, "Room")), h("div", { class: "toolbar" }, account, toggle)),
    h("main", {}, ...content),
    h(
      "footer",
      {},
      "A demo app for UI testing with ",
      h("a", { href: "https://kintsugi-qa.com", rel: "noopener" }, "Kintsugi QA"),
      ".",
    ),
  );
}

function errorLine(): HTMLElement | false {
  return error ? h("p", { class: "error", role: "alert", id: "form-error" }, error) : false;
}

function home(): HTMLElement {
  const L = look();
  const createBtn = h("button", { class: L.primary, type: "button", onclick: () => go("create") }, L.create);
  const joinBtn = h("button", { type: "button", onclick: () => go("join") }, L.join);
  const buttons = L.joinFirst ? [joinBtn, createBtn] : [createBtn, joinBtn];
  return shell(
    h(
      "div",
      { class: "card stack" },
      h("h1", {}, "Play a live quiz"),
      h("p", { class: "lead" }, "Host a room, share the code and let your friends join. Free, no sign-up."),
      !connected && h("p", { class: "muted", role: "status" }, "Connecting…"),
      errorLine(),
      h("div", { class: "row" }, ...buttons),
    ),
  );
}

function go(s: Screen): void {
  screen = s;
  error = "";
  render();
}

function createForm(): HTMLElement {
  const L = look();
  const name = h("input", { id: "host-name", name: "name", autocomplete: "nickname", maxlength: 20, required: true, value: form.name });
  const option = (q: QuizInfo) => h("option", { value: q.id, selected: q.id === form.quiz }, `${q.title} (${q.questions} questions)`);
  const builtIn = quizzes.filter((q) => !q.mine);
  const mine = quizzes.filter((q) => q.mine);
  const quiz = h(
    "select",
    { id: "quiz-set", name: "quiz" },
    mine.length ? h("optgroup", { label: "Built-in" }, ...builtIn.map(option)) : null,
    mine.length ? h("optgroup", { label: "My quizzes" }, ...mine.map(option)) : null,
    ...(mine.length ? [] : builtIn.map(option)),
  );
  const f = h(
    "form",
    {
      class: "card stack",
      onsubmit: (e) => {
        e.preventDefault();
        form.name = name.value;
        form.quiz = quiz.value;
        const fast = params.get("fast") === "1";
        const seedRaw = params.get("seed");
        const seed = seedRaw !== null && seedRaw !== "" && Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : undefined;
        send({ type: "create", name: form.name, quiz: form.quiz, fast, seed, v: urlVariant() });
      },
    },
    h("h1", {}, L.create),
    h("div", {}, h("label", { for: "host-name" }, "Your name"), name),
    h("div", {}, h("label", { for: "quiz-set" }, "Quiz set"), quiz),
    errorLine(),
    h(
      "div",
      { class: "row" },
      h("button", { class: L.primary, type: "submit" }, L.submitCreate),
      h(
        "button",
        {
          type: "button",
          onclick: () => {
            form.name = name.value;
            go("builder");
          },
        },
        "Create your own quiz",
      ),
      h("button", { type: "button", onclick: () => go("home") }, "Back"),
    ),
  );
  queueMicrotask(() => name.focus());
  return shell(f);
}

function joinForm(): HTMLElement {
  const L = look();
  const code = h("input", { id: "room-code-input", class: "code-input", name: "code", autocomplete: "off", maxlength: 6, required: true, value: form.code });
  const nick = h("input", { id: "nickname", name: "nickname", autocomplete: "nickname", maxlength: 20, required: true, value: form.nickname });
  const f = h(
    "form",
    {
      class: "card stack",
      onsubmit: (e) => {
        e.preventDefault();
        form.code = code.value.trim().toUpperCase();
        form.nickname = nick.value;
        send({ type: "join", code: form.code, nickname: form.nickname });
      },
    },
    h("h1", {}, L.join),
    h("div", {}, h("label", { for: "room-code-input" }, "Room code"), code),
    h("div", {}, h("label", { for: "nickname" }, "Nickname"), nick),
    errorLine(),
    h(
      "div",
      { class: "row" },
      h("button", { class: L.primary, type: "submit" }, L.submitJoin),
      h("button", { type: "button", onclick: () => go("home") }, "Back"),
    ),
  );
  queueMicrotask(() => (form.code ? nick : code).focus());
  return shell(f);
}


function signOut(): void {
  fetch("/api/logout", { method: "POST" }).finally(() => {
    reconnectDelay = 0;
    ws?.close();
  });
}

function signInForm(): HTMLElement {
  const email = h("input", { id: "email", name: "email", type: "email", autocomplete: "username", required: true, value: credentials.email });
  const password = h("input", { id: "password", name: "password", type: "password", autocomplete: "current-password", required: true });
  const f = h(
    "form",
    {
      class: "card stack",
      onsubmit: async (e) => {
        e.preventDefault();
        credentials.email = email.value;
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.value, password: password.value }),
        });
        if (res.ok) {
          // A new connection picks up the session and sends the saved quizzes.
          screen = "home";
          error = "";
          reconnectDelay = 0;
          ws?.close();
        } else {
          error = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not sign in.";
          render();
        }
      },
    },
    h("h1", {}, "Sign in"),
    h("p", { class: "lead" }, "Hosts can sign in to keep their own quizzes. Players do not need an account."),
    h("div", {}, h("label", { for: "email" }, "Email"), email),
    h("div", {}, h("label", { for: "password" }, "Password"), password),
    errorLine(),
    h(
      "div",
      { class: "row" },
      h("button", { class: look().primary, type: "submit" }, "Sign in"),
      h("button", { type: "button", onclick: () => go("home") }, "Back"),
    ),
  );
  queueMicrotask(() => (credentials.email ? password : email).focus());
  return shell(f);
}

function builderForm(): HTMLElement {
  const L = look();
  const name = h("input", { id: "host-name", name: "name", autocomplete: "nickname", maxlength: 20, required: true, value: form.name, oninput: (e) => (form.name = (e.target as HTMLInputElement).value) });
  const title = h("input", { id: "quiz-title", name: "title", maxlength: QUIZ_LIMITS.title, value: draft.title, oninput: (e) => (draft.title = (e.target as HTMLInputElement).value) });
  const letters = ["A", "B", "C", "D"];
  const questions = draft.questions.map((q, i) => {
    const n = i + 1;
    const rows = letters.map((letter, a) =>
      h(
        "div",
        { class: "answer-row" },
        h("input", {
          type: "radio",
          name: `correct-${i}`,
          "aria-label": `Question ${n}: answer ${letter} is correct`,
          checked: q.correct === a,
          onchange: () => (q.correct = a),
        }),
        h("label", { class: "sr-only", for: `q${i}-a${a}` }, `Question ${n}, answer ${letter}`),
        h("input", {
          id: `q${i}-a${a}`,
          placeholder: `Answer ${letter}`,
          maxlength: QUIZ_LIMITS.answer,
          value: q.answers[a] ?? "",
          oninput: (e) => (q.answers[a] = (e.target as HTMLInputElement).value),
        }),
      ),
    );
    return h(
      "fieldset",
      { class: "qbox" },
      h("legend", {}, `Question ${n}`),
      h("div", {}, h("label", { for: `q${i}-text` }, "Question text"), h("input", { id: `q${i}-text`, maxlength: QUIZ_LIMITS.text, value: q.text, oninput: (e) => (q.text = (e.target as HTMLInputElement).value) })),
      h("p", { class: "muted hint" }, "Type four answers and select the correct one."),
      ...rows,
      draft.questions.length > 1 &&
        h("button", { class: "quiet", type: "button", onclick: () => { draft.questions.splice(i, 1); render(); } }, `Remove question ${n}`),
    );
  });
  const f = h(
    "form",
    {
      class: "card stack",
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        if (!form.name.trim()) {
          error = "Enter your name.";
          return render();
        }
        const check = validateQuiz(draft);
        if (!check.ok) {
          error = check.error;
          return render();
        }
        error = "";
        send({ type: "create", name: form.name, custom: check.quiz, save: draft.save && Boolean(auth.user), fast: params.get("fast") === "1", seed: Number.isFinite(Number(params.get("seed"))) && params.get("seed") ? Number(params.get("seed")) : undefined, v: urlVariant() });
      },
    },
    h("h1", {}, "Create your own quiz"),
    h("div", {}, h("label", { for: "host-name" }, "Your name"), name),
    h("div", {}, h("label", { for: "quiz-title" }, "Quiz title"), title),
    ...questions,
    h(
      "button",
      { type: "button", disabled: draft.questions.length >= QUIZ_LIMITS.questions, onclick: () => { draft.questions.push(emptyQuestion()); render(); } },
      "Add question",
    ),
    auth.user &&
      h(
        "div",
        { class: "check" },
        h("input", { id: "save-quiz", type: "checkbox", checked: draft.save, onchange: (e) => (draft.save = (e.target as HTMLInputElement).checked) }),
        h("label", { for: "save-quiz" }, "Keep this quiz in my account"),
      ),
    errorLine(),
    h(
      "div",
      { class: "row" },
      h("button", { class: L.primary, type: "submit" }, "Play this quiz"),
      h("button", { type: "button", onclick: () => go("create") }, "Back"),
    ),
  );
  // An old message should not stay once the person starts fixing the problem.
  const clearError = () => {
    error = "";
    document.getElementById("form-error")?.remove();
  };
  f.addEventListener("input", clearError);
  f.addEventListener("change", clearError);
  return shell(f);
}

function playerList(s: RoomState): HTMLElement {
  return h(
    "ul",
    { class: "players", "aria-label": "Players" },
    ...s.players.map((p) =>
      h(
        "li",
        { class: `player${s.you?.id === p.id ? " you" : ""}${p.connected ? "" : " offline"}`, "--pc": p.color },
        h("span", { class: "avatar", "aria-hidden": "true" }, p.avatar),
        h("span", {}, p.nickname + (s.you?.id === p.id ? " (you)" : "")),
      ),
    ),
  );
}

function lobby(s: RoomState): HTMLElement {
  const L = look();
  const link = `${location.origin}/r/${s.code}`;
  const codeBlock = h(
    "div",
    { class: "card stack" },
    h("p", { class: "muted" }, s.role === "host" ? "Room code" : `Hosted by ${s.hostName}`),
    h("p", { class: "code", id: L.codeId, "aria-label": `Room code ${s.code.split("").join(" ")}` }, s.code),
    s.role === "host" && h("p", { class: "joinlink muted" }, "Join link: ", h("a", { href: link }, link)),
  );
  const players = h(
    "div",
    { class: "card stack" },
    h("h2", {}, `Players (${s.players.length})`),
    s.players.length ? playerList(s) : h("p", { class: "muted" }, "Waiting for players to join…"),
    s.role === "host"
      ? h(
          "div",
          { class: "stack" },
          errorLine(),
          h("button", { class: L.primary, id: L.startId, type: "button", onclick: () => send({ type: "start" }) }, L.start),
        )
      : h("p", { class: "muted", role: "status" }, "You are in. Waiting for the host to start…"),
  );
  return shell(h("div", { class: "stack" }, ...(L.joinFirst ? [players, codeBlock] : [codeBlock, players])));
}

function secondsLeft(): number {
  return Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
}

function question(s: RoomState): HTMLElement {
  const q = s.question!;
  const host = s.role === "host";
  const locked = s.myChoice !== null;
  const low = s.fast ? 3 : 5;
  const timer = h("span", { class: "timer", id: "timer", role: "timer", "aria-label": "Seconds left" }, String(secondsLeft()));
  if (secondsLeft() <= low) timer.classList.add("low");
  const answers = q.answers.map((text, i) => {
    const cls = `answer a${i}${s.myChoice === i ? " picked" : ""}${locked && s.myChoice !== i ? " dim" : ""}`;
    const inner = [h("span", { class: "shape", "aria-hidden": "true" }, SHAPES[i]!), h("span", {}, text)];
    if (host) return h("li", { class: cls }, ...inner);
    return h("button", { class: cls, type: "button", disabled: locked, "aria-pressed": s.myChoice === i, onclick: () => send({ type: "answer", choice: i }) }, ...inner);
  });
  return shell(
    h(
      "div",
      { class: "card" },
      h("div", { class: "progress" }, h("span", {}, `Question ${q.index + 1} of ${q.total}`), timer),
      h("h2", { class: "question" }, q.text),
      host ? h("ul", { class: "answers plain" }, ...answers) : h("div", { class: "answers", role: "group", "aria-label": "Answers" }, ...answers),
      h(
        "p",
        { class: "muted status-line", role: "status", id: "status" },
        host ? `${s.answeredCount} of ${s.players.length} answered` : locked ? "Answer locked. Waiting for the others…" : "Pick an answer.",
      ),
    ),
  );
}

function board(s: RoomState): HTMLElement {
  return h(
    "ol",
    { class: "board", "aria-label": "Leaderboard" },
    ...s.leaderboard.map((r) =>
      h(
        "li",
        { class: s.you?.id === r.id ? "you" : "" },
        h("span", { class: "rank" }, String(r.rank)),
        h("span", { class: "avatar", "aria-hidden": "true" }, r.avatar),
        h("span", { class: "name" }, r.nickname),
        h("span", { class: "score" }, `${r.score} points`),
      ),
    ),
  );
}

function reveal(s: RoomState): HTMLElement {
  const L = look();
  const q = s.question!;
  const r = s.reveal!;
  const mine = r.myResult;
  const verdict = !mine
    ? null
    : mine.correct
      ? h("p", { class: "verdict ok", id: "result" }, `Correct! +${mine.points} points`)
      : h("p", { class: "verdict bad", id: "result" }, mine.choice === null ? "Time's up. No answer." : "Wrong answer");
  const answers = q.answers.map((text, i) =>
    h(
      "li",
      { class: `answer a${i}${i === r.correctIndex ? " right" : " dim"}` },
      h("span", { class: "shape", "aria-hidden": "true" }, SHAPES[i]!),
      h("span", {}, text + (i === r.correctIndex ? " (correct)" : "")),
      h("span", { class: "count", "aria-label": `${r.counts[i]} players` }, String(r.counts[i])),
    ),
  );
  const nextBtn =
    s.role === "host" &&
    h("button", { class: L.primary, id: L.nextId, type: "button", onclick: () => send({ type: "next" }) }, s.isLastQuestion ? L.final : L.next);
  return shell(
    h(
      "div",
      { class: "stack" },
      h(
        "div",
        { class: "card stack" },
        h("div", { class: "progress" }, h("span", {}, `Question ${q.index + 1} of ${q.total}`)),
        verdict,
        h("h2", { class: "question" }, q.text),
        h("ul", { class: "answers plain" }, ...answers),
      ),
      h("div", { class: "card stack" }, h("h2", {}, "Leaderboard"), board(s), nextBtn),
    ),
  );
}

function finished(s: RoomState): HTMLElement {
  const L = look();
  const top = s.leaderboard.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const order = [1, 0, 2].filter((i) => top[i]);
  const step = (i: number) => {
    const r = top[i]!;
    const cls = ["first", "second", "third"][i]!;
    return h(
      "div",
      { class: `step ${cls}` },
      h("div", { class: "avatar", "aria-hidden": "true" }, r.avatar),
      h("div", {}, h("strong", {}, r.nickname)),
      h("div", { class: "block" }, h("div", { class: "medal", "aria-hidden": "true" }, medals[i]!), h("div", {}, `${r.score} points`)),
    );
  };
  return shell(
    h(
      "div",
      { class: "card stack" },
      h("h1", {}, "Final results"),
      h("div", { class: "podium", "aria-label": "Podium" }, ...order.map(step)),
      h("h2", {}, "Full list"),
      board(s),
      h(
        "button",
        {
          class: L.primary,
          type: "button",
          onclick: () => {
            save(null);
            state = null;
            screen = "home";
            history.replaceState(null, "", "/" + location.search);
            render();
          },
        },
        L.playAgain,
      ),
    ),
  );
}

// ---- drawing ---------------------------------------------------------

function render(): void {
  const root = document.getElementById("app")!;
  let view: HTMLElement;
  if (state) {
    view = { lobby, question, reveal, finished }[state.phase](state);
  } else {
    view = { create: createForm, join: joinForm, signin: signInForm, builder: builderForm, home }[screen]();
  }
  root.replaceChildren(view);
  if (ticker) clearInterval(ticker);
  if (state?.phase === "question") {
    ticker = window.setInterval(() => {
      const t = document.getElementById("timer");
      if (!t) return;
      const left = secondsLeft();
      t.textContent = String(left);
      t.classList.toggle("low", left <= (state?.fast ? 3 : 5));
    }, 250);
  }
}

render();
connect();
