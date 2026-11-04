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

Not built yet. The create-your-own-quiz form comes in the next step.
