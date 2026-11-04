# Prompts for making Kintsugi QA tests from this code

You clone this repo, open Claude Code in it, and paste one prompt at a time.
Claude Code reads the code here (the real HTML, the game rules, the quiz
questions) and writes the tests through the
[Kintsugi QA API](https://kintsugi-qa.com/llms.txt).

The demo app is at **https://demo.kintsugi-qa.com**.

Together the prompts use most Kintsugi features: tests, multi-user tests,
variables, secrets, dependencies, suites, schedules, webhooks, browsers and
devices, and self-healing. The table at the end shows what is covered and what
is not.

## Before you start

1. In Kintsugi, create an API key (Organization settings, API keys). Keep it
   in your shell, never in a file in this repo and never inside a prompt:
   ```sh
   export KINTSUGI_API_KEY=ksk_...
   export QUIZ_DEMO_PASSWORD=...     # only for prompt 5
   ```
2. Start Claude Code in this folder: `claude`.
3. Paste the **common start** first. Then paste one prompt.

## Common start (paste this first, once per session)

```text
You will create tests in Kintsugi QA for the demo app in this repository.

Rules:
- Read https://kintsugi-qa.com/llms.txt completely before you write a test.
  Follow it exactly. It says how the API works and which fields are allowed.
- Use the environment variable KINTSUGI_API_KEY for the key. Never print it,
  never write it to a file, never put it in a command that is saved.
- You write the test JSON yourself. Do not use AI generation endpoints; API
  keys cannot call them.
- Learn the app from the code, not by guessing: read src/client/main.ts (the
  screens and their texts), src/client/copy.ts, src/server/room.ts (the game
  rules and scoring), src/server/quizzes.ts (the questions) and docs/scenarios.md.
- The app has no test ids on purpose. Find elements like a user does: by role,
  label and visible text. Prefer selectors that survive a redesign.
- The app is at https://demo.kintsugi-qa.com. Use ?fast=1&seed=123 on the
  first page so the question order is fixed and timers are short.
- Find or create a project named "QuizRoom demo" with base URL
  https://demo.kintsugi-qa.com. Create tests there. Do not touch other projects.
- After you create a test, run it, wait for the result, and fix the test until
  it passes. Then show me: the test name, the run result and how long it took.
  If a run fails because of the app and not the test, tell me instead of
  working around it.
```

## 1. One player joins and answers

```text
Create a test "Join and answer" with two actors: Host and Player. It is
scenario 1 in docs/scenarios.md.

Host creates a room (name Hana, quiz "Web basics") and reads the room code
into a variable. Player opens the app, joins with that code as "Ana". Host sees
Ana in the list and starts the game. Player answers the first question and
sees a result and the leaderboard.

Use a barrier so Player joins only after the code is known. Check the result
with an assertion: from the code, work out the first question for seed 123 and
the correct answer, then make Player pick the correct one and assert the text
"Correct!".
```

## 2. Host and four players (multi-user)

```text
Create a test "Host and four players" with five actors: Host, Ana, Bo, Cy, Di.
It is scenario 2 in docs/scenarios.md.

Host creates a room and shares the code. The four players join. Host sees
"Players (4)" and starts. All four see the same question. Ana and Bo answer
correctly, Cy answers wrong, Di does not answer. When the time is up everyone
sees the result and the same leaderboard. Host clicks "Next question" and all
see question 2.

Compute the expected question and correct answer for seed 123 from the code.
Do not hard code guesses. Use barriers for each shared moment (joined, started,
answered, revealed). Assert the leaderboard: Ana and Bo have the same rank and
more points than Cy and Di, and Cy and Di have 0 points.
```

## 3. Create your own quiz (forms and error messages)

```text
Create a test "Own quiz with validation" with two actors: Host and Player. It
is scenario 3 in docs/scenarios.md.

Host opens "Create your own quiz" and submits the empty form. Check each error
message in order: the missing title, the missing question text, the missing
correct answer, and answers that are the same. The messages are in
src/shared/validate.ts. Then Host builds a valid quiz of 2 questions, plays
it with Player and Player answers both correctly.

Use the exact error texts from the code in the assertions.
```

## 4. Dependency chain: create a room, then try to start it empty

```text
Create two tests and link them:
- "Create a room" (one actor): create a room with the quiz "General knowledge"
  and stop in the lobby.
- "Host cannot start without players" depends on it with depends_on. It has one
  actor, the host. It clicks "Start game" while nobody has joined, asserts the
  exact error text from src/server/room.ts, and asserts that the lobby is
  still shown.

Read the section about depends_on and transition in llms.txt first. Note that
depends_on can only be set with PUT after the test exists, and that the steps
of the parent go to the first actor only. Run only the second test and check
that the steps of the first one ran before it.
```

Note: a game cannot start with no players, and the host does not play. That is
why this chain tests the refusal and not a solo game.

## 5. Sign in with a secret

```text
Create a test "Sign in as demo host". Store the demo password as a Kintsugi
secret named DEMO_PASSWORD, with the value from the environment variable
QUIZ_DEMO_PASSWORD (do not print it). The demo email is demo@kintsugi-qa.com.

The test: click Sign in, enter the email and a WRONG password and assert the
error "Wrong email or password."; then enter the secret with {{SECRET_DEMO_PASSWORD}} and assert
"Signed in as demo@kintsugi-qa.com". Create a quiz, tick "Keep this quiz in my
account" and check that it appears under "My quizzes" when you create the next
room. After the run, check that the password does not appear in the run
result or the artifacts.
```

## 6. Phone and other browsers

```text
Take the test from prompt 1 and make three copies, one for each setup:
Firefox, WebKit, and a phone (pick an iPhone or Pixel device from
GET /meta/browser-options). On the phone, only the Player is on the phone; the
Host stays on a desktop browser, if per actor settings allow it. If they do
not, run the whole test on the phone.

The app has a layout for small screens (answers go into one column). Add an
assertion that proves the phone layout is used, for example that the four
answer buttons are all visible without sideways scrolling. Make a suite
"Browsers" with the three tests.
```

## 7. Self-healing with the redesign

```text
Make a copy of the test from prompt 1 and call it "Heal demo". Do not change
its selectors.

The app has a redesign switch: ?v=2 changes texts, order, classes and ids but
not the logic. Read src/client/copy.ts to see exactly what changes. Run
"Heal demo" with ?v=2 on the first page, and watch the run: it should heal
steps. When it is done, show me: which steps healed, the old and the new
selector for each, and the healing explanation from healing_attempts. Then
tell me which changes the healing could not handle, if any.

Do not fix the test yourself before the heal run.
```

## 8. Suite, schedule and webhook

```text
Make a suite "QuizRoom smoke" with the tests from prompts 1, 3 and 5.
Then:
1. Create a schedule that runs the suite every day at 07:00 in the time zone
   Europe/Stockholm.
2. Create a webhook token for the suite and show me the curl command that
   triggers it (do not print the token in the chat; tell me where I can find it).
3. Trigger the suite once and wait for the result.

Tell me what the schedule and the webhook cost in runs, if the plan has limits.
```

## 9. Tests you make in the Kintsugi app (by hand)

The API cannot start AI generation or the step-by-step editor, so these are
made by you in the Kintsugi web app. You only describe the test in words. They
also make good videos.

Setup: open the project "QuizRoom demo". For every test below, give the base
URL `https://demo.kintsugi-qa.com/?fast=1&seed=123`. Wording in the Kintsugi
app may change with its redesign. If a button is named differently, follow the
new name.

### 9a. One test written by the AI (the probe)

Generate a test and paste this description:

```text
A host creates a room with the quiz "Web basics" and a player joins with the
room code. The host starts the game, the player answers the first question,
and sees whether the answer was correct.
```

Watch the AI open the site, explore it and write the steps. Save and run it.

### 9b. A test with several users (the probe)

```text
Test with three users: a host and two players. Both players join the same
room, both answer the first question, and everyone sees the same leaderboard
with two names.
```

This shows that the AI plans several browsers and the points where they wait
for each other.

### 9c. A form with errors (the probe)

```text
On the home page the host chooses to create their own quiz. Submit the empty
form and check that the page explains what is missing. Then fill in a title
and one question with four different answers, mark the correct one and play
the quiz.
```

### 9d. Sign-in with a secret

First add a secret `DEMO_PASSWORD` in the project (Secrets) with the demo
password. Then generate:

```text
Sign in as the demo host with the email demo@kintsugi-qa.com and the stored
secret DEMO_PASSWORD. Check that the top bar shows who is signed in. Then
create a quiz and keep it in the account.
```

Open the run and check that the password is masked everywhere.

### 9e. Step by step in the editor (authoring)

Start a new test and build it in the interactive editor with three users
(Host, Ana, Bo). Go one round at a time: create the room, join, start, answer.
This is the slower way, but you see every step before it is saved.

### 9f. Regenerate after a redesign

Open the test from 9a, then run it against `?v=2`. When healing is not enough,
use "Regenerate" so the AI rewrites the test for the new look. Compare the old
and new steps.

### 9g. Environments, schedule and notifications

These are settings, not tests, but they belong to the story. In the project:
add the environments `classic` and `redesign` (the second one with `?v=2`),
make a schedule for the suite from prompt 8, and add a notification channel
(Slack or a webhook URL). Then let a run fail on purpose, for example with a
wrong room code, and see the message arrive.

## What these prompts cover

| Kintsugi feature | Prompt |
|---|---|
| Single and multi-user tests | 1, 2, 3 |
| Barriers and handing a value between users | 1, 2 |
| Variables, extract, assertions (text, number) | 1, 2, 3 |
| Forms and error messages | 3 |
| Dependency chain (`depends_on`) | 4 |
| Secrets (masked values) | 5 |
| Browsers and phone devices | 6 |
| Self-healing | 7 |
| Suites | 6, 8 |
| Schedules and webhooks | 8 |
| AI test creation (probe), with one and many users | 9a, 9b, 9c |
| Secrets in the app | 9d |
| Step by step editor (authoring) | 9e |
| Regenerate after a redesign | 9f |
| Environments, schedules, notification channels | 9g |

Not covered by this demo, because the quiz has no such thing: file upload and
download, drag and drop, double click, hover menus.
