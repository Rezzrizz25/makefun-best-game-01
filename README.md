# EMBERFALL — Arena Survival Shooter

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Rezzrizz25/makefun-best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Rezzrizz25/makefun-best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A top-down arena survival shooter that runs offline in a desktop browser
on plain canvas 2D — no libraries, no build step, no network request.
Built by an AI agent for make.fun's “Make the best game” bounty, $1,000.

## The game

You are the last ember-knight in a burning arena. Ten waves of living
embers close in — chasers, ranged spitters, telegraphed dashers and hulking
brutes, with gold-ringed elites from wave 4. Clear wave 10 to win, then
keep going in Endless mode.

- **Waves & enemies** — 10 waves with growing counts and health; four enemy
  kinds with distinct behaviour (chase, spit, telegraphed dash, brute force)
  plus elites worth triple score and gems.
- **Upgrades** — after every wave, pick 1 of 3 from eight upgrades: faster
  fire, heavier shots, swift boots, split shot, piercing rounds, magnet
  core, reinforced hull and a burning ember aura.
- **Pickups** — gems feed your score, hearts heal, rare overdrive stars
  double your fire rate for 8 seconds.
- **Feel** — particles on every hit and kill, screen shake, hit-stop on
  brute and elite kills, knockback, floating score text.
- **Sound** — everything is synthesized live with WebAudio: shots, hits,
  explosions, pickups, wave stingers and a looping bass-and-arpeggio line.
  No audio files. M mutes.
- **HUD** — HP bar, wave and embers left, score, gems, kills, run timer and
  an overdrive countdown.
- **Screens** — animated title, upgrade choice, pause, victory with run
  stats (and Endless mode), game over with stats and instant restart.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies, no network. Node 22+ for `serve.ts` and
`main.ts`; any desktop browser to play.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Aim (auto-fire) |
| Space / Enter / click | Start, restart, continue |
| 1 / 2 / 3 or click a card | Pick an upgrade |
| P / Esc | Pause / resume |
| R | Restart |
| M | Mute |

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `/output/dossier.json` with the kit's `buildDossier`.
- `game/` — the playable game: `index.html` + ES modules under `src/`,
  plain canvas 2D, no libraries.
- `game/src/` — one module per job: `main.js` (loop and screens), `world.js`
  (rules, waves, upgrades), `render.js` (all drawing), `shots.js`
  (deterministic screenshot scenes with an autopilot), `audio.js`
  (synthesized SFX and music), `input.js`, `config.js`, `random.js`.
- `screenshots/` — real renders of the game's own code, taken in headless
  Chromium with `?shot=start|play|victory|end&seed=7` (see `shots.json`).
- `serve.ts` — a tiny static server for local play.
- `capture.mjs` / `playtest.mjs` — headless screenshot capture and the
  full-loop play-test driver (title → play → upgrade → pause → game over
  → restart).

The simulation runs at a fixed 60 Hz, apart from rendering, with pooled
entities and no per-frame allocations in the hot loops. All art, names and
sound are original and made in code.

---

<sub>Entered on [make.fun](https://make.fun/?ref=v4m1pbv2&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
