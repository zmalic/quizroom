# Example scenarios for Kintsugi QA

Use these with `?fast=1&seed=123` on the address. The seed fixes the question
order and `fast` shortens the timer to 10 seconds. Add `&v=2` to see the
redesigned interface (same logic, other texts and ids) and to try self-healing.

## 1. One player joins and answers a question

Two actors: **Host** and **Player**.

1. Host opens the home page, chooses "Create a room", enters the name "Hana",
   picks "Web basics" and creates the room. Host saves the room code.
2. Player opens the join link, enters the nickname "Ana" and joins.
3. Host sees "Ana" in the player list and clicks "Start game".
4. Player sees the first question and a timer, clicks an answer.
5. Player sees "Correct!" or "Wrong answer" and the leaderboard with "Ana".

## 2. Host and four players: the same question and the same leaderboard

Five actors: **Host**, **Ana**, **Bo**, **Cy**, **Di**.

1. Host creates a room and shares the code. The four players join with their
   nicknames. Host sees "Players (4)".
2. Host clicks "Start game". All four players see the same question text.
3. Every player answers. The question closes by itself when all have answered.
4. Every player sees a result and the same leaderboard with four names.
5. Host clicks "Next question". All players see question 2.

## 3. Create a custom quiz, then play it

Two actors: **Host** and **Player**. Good for testing forms and their error
messages.

1. Host opens the home page, chooses "Create a room", enters the name "Hana"
   and clicks "Create your own quiz".
2. Host enters the title "Capitals" and clicks "Play this quiz" with an empty
   form. The page shows "Question 1 needs a text."
3. Host fills in the question "Capital of Sweden?" with four answers, but does
   not mark the correct one. The page shows "Question 1: mark the correct
   answer."
4. Host marks "Stockholm" as correct. Host clicks "Add question" and adds
   "2 + 2?" with the correct answer "4".
5. Host clicks "Play this quiz" and gets a room code. Player joins as "Ana".
6. Host starts the game. Player answers both questions correctly and sees
   "Correct!" and the leaderboard.

## 4. Sign in with a stored secret

One actor. The demo account comes from the server settings `DEMO_EMAIL` and
`DEMO_PASSWORD`. Store the password as a secret in Kintsugi QA.

1. Open the home page and click "Sign in".
2. Enter the email and a wrong password. The page shows "Wrong email or
   password."
3. Enter the right password. The top bar shows "Signed in as ...".
4. Create a room with your own quiz and tick "Keep this quiz in my account".
5. Click "Close room", then open "Create a room" again. The quiz appears under
   "My quizzes". Select it and click "Delete this quiz". It disappears from
   the list.
