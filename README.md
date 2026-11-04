# QuizRoom

A small live quiz game, like Kahoot. A host creates a room, players join with a
code, everyone answers the same questions at the same time and a leaderboard
shows who is best.

It is a demo app for UI testing with [Kintsugi QA](https://kintsugi-qa.com). It
has real-time features, several users at once, forms and a timer, which makes
it a good target for multi-user tests. Live demo: `demo.kintsugi-qa.com`
(not online yet).

Open source, MIT license.

## Run it

You need Node 20 or newer.

```sh
npm install
npm run build
npm start          # http://localhost:3000
```

For development: `npm run dev` rebuilds on change. Tests: `npm test`.

## How to play

1. Open the home page and choose "Create a room". Enter your name and pick a
   quiz set. You get a 6-character room code and a join link.
2. Players choose "Join a room" (or open the link), then enter the code and a
   nickname.
3. The host clicks "Start game". Each question has four answers and a timer.
   Faster correct answers give more points (1000 down to 500).
4. After each question everyone sees the correct answer and the leaderboard.
   The host clicks "Next question". At the end there is a podium.

## Your own quiz and sign-in

On the create page, "Create your own quiz" opens a form: a title and up to 10
questions with four different answers each, and one marked as correct. The page
explains what is wrong before it creates the room.

A host can sign in to keep quizzes. There is one demo account. Set both
`DEMO_EMAIL` and `DEMO_PASSWORD` on the server to turn sign-in on. Without them
there is no sign-in button. Kept quizzes live in memory and are lost when the
server restarts. Players never need an account.

## Switches for testing

Add these to the address of the page where the host creates the room. They
belong to the whole room, so all players see the same thing.

| Switch | What it does |
|---|---|
| `?seed=123` | The same question order every time (answers keep their place). |
| `?fast=1` | Short timers (10 seconds instead of 20). |
| `?v=2` | A redesigned look: other button texts ("Start game" becomes "Begin"), other order, other classes and ids. The logic is the same. Good for showing self-healing. |

Set `UI_VARIANT=2` on the server to make the redesign the default for every
new room.

The HTML uses real buttons, labels, roles and visible text. There are no test
ids, so a test finds elements like a user does. There is no captcha.

See [docs/scenarios.md](docs/scenarios.md) for example test scenarios.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port to listen on |
| `MAX_ROOMS` | 200 | Rooms at the same time |
| `MAX_PLAYERS` | 50 | Players in one room |
| `ROOM_TTL_MINUTES` | 60 | A room with no activity is deleted after this time |
| `QUESTION_SECONDS` | 20 | Time for a question |
| `FAST_QUESTION_SECONDS` | 10 | Time for a question with `?fast=1` |
| `ACTIONS_PER_MINUTE` | 300 | Rooms created or joined per client address per minute |
| `UI_VARIANT` | 1 | `2` makes the redesign the default |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | not set | The demo host account. Sign-in is off without both |

The limit per address is high on purpose. Test runners open many browsers from
the same address.

## Deploy

One Docker container:

```sh
docker build -t quizroom .
docker run -p 3000:3000 quizroom
```

**Run exactly one instance.** All rooms are in memory. A restart ends every
game. No personal data is stored: only nicknames, and only while a room lives.
Put it behind HTTPS and make sure WebSocket connections on `/ws` are allowed.
The health check is `GET /healthz`.

### Fly.io

`fly.toml` is ready: region Stockholm, one always-on machine with 256 MB.

```sh
fly apps create <app-name>          # then put the name in fly.toml
fly secrets set DEMO_EMAIL=... DEMO_PASSWORD=...
fly deploy --ha=false               # --ha=false: exactly one machine
fly scale count 1
fly certs add demo.example.com      # then a CNAME to <app-name>.fly.dev
```

The deploy workflow in `.github/workflows` starts by hand and needs the
repository secret `FLY_API_TOKEN` (use `fly tokens create deploy`).

## Project layout

- `src/server`: HTTP and WebSocket server, rooms and game rules.
- `src/client`: the browser app (plain TypeScript, no framework).
- `src/shared`: the messages between them.
- `test`: unit tests for the rules and an end-to-end test with real sockets.

## License

MIT
