# Contributing

This is a small open-source project; contributions are welcome.

## Setup

```bash
npm install
npm run dev
```

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Where things live

- `src/lib/` -- the dependency-free TypeScript library (astronomy, dial
  geometry, rendering, export). This is the part worth reviewing carefully:
  it is the actual math.
- `src/lib/render/` -- SVG/PDF drawing, kept separate from the geometry so the
  geometry stays pure and testable.
- `src/main.ts`, `src/state.ts`, `src/ui/` -- the browser UI, a thin layer
  over the library with no framework.
- `tests/oracle.test.ts` -- the independent 3D ray-casting oracle. If you
  change dial geometry, this is the test that should catch it; please add
  cases here rather than only asserting against the code you just wrote.

## Reporting a correctness bug

If a dial looks wrong, the most useful report is: latitude, longitude, date,
clock time, dial type and wall declination (if vertical), plus what you
expected vs. what you got. That is exactly the input shape the oracle test
takes, so it is easy to turn into a regression test.
