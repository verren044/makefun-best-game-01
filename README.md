# EMBERWARDEN — Keeper of the Last Lantern

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/verren044/makefun-best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/verren044/makefun-best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A best-game-01 entry: a complete, original top-down arena shooter that runs
offline in a desktop browser from static files. You are the last warden of a
beacon; hold the light through 10 waves of shadow creatures and slay the
Gloomlord on wave 10 to win.

**Hold the light:** your lantern and the beacon each carry a pool of light.
Shadows standing outside it are armoured — they take 40% less damage and
move faster — so the fight is about position: kite the horde into the glow,
spend a flare to surge your light wide, or take the Lantern's Reach blessing
to widen it for good.

## Play

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

- WASD / Arrows — move · Mouse — aim · Hold Click / Space — fire embers
- SHIFT — dash (brief invulnerability) · E / Right-click — flare burst
- P / ESC — pause · M — mute · R — restart after game over / victory

Clear a wave, then pick 1 of 3 upgrade cards (keys 1–3 or click). Enemies:
wisps, motes, spitters, brutes, splitters, blink-teleporting stalkers, and
the Gloomlord boss every 5th wave (radial bursts, summons, telegraphed
charges, enraged below half health). Combo multiplier grows with kills;
hearts, ember shards and flare charges drop from the fallen. Best score
persists in localStorage.

## Files

- `game/` — the game: `index.html` + ES modules under `src/` (one job each:
  `config`, `random`, `audio`, `input`, `particles`, `enemies`, `upgrades`,
  `world`, `render`, `shots`, `main`). No libraries, no network requests.
- `screenshots/` — 4 real renders: title, play, boss fight, victory.
- `main.ts` — Node 22, stdlib only: copies `game/` + `screenshots/` to
  `/output` (`MAKEFUN_OUTPUT_DIR` outside the grader) and writes
  `/output/dossier.json` via `vendor/makefun-game.ts` (kit copy, unchanged).
- `shots.json` — the four staged scenes; `take-shots.mjs` — the headless
  Chrome (CDP) driver that takes them and runs the interactive smoke test.
- `serve.ts` — tiny static server for local play.

Screenshot scenes are deterministic: `?shot=<title|play|boss|victory|end>&seed=7`
plays the real rules forward with a seeded autopilot, so the same seed gives
the same frame.

## Verify

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # run twice, diff -r: byte-identical
node take-shots.mjs smoke                              # interactive headless play test
node take-shots.mjs shots                              # retake the 4 screenshots
```

## License

MIT — see `LICENSE`.

---

Entered on [make.fun](https://make.fun/?ref=vvz66fvh&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards
