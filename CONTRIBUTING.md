# Contributing

Bug reports with a small SVG, the options you used and a screenshot of what went wrong are the most useful thing you can send.

1. Use Node.js 20 or newer and run `npm ci`.
2. Add a small regression test in `test/` for geometry changes.
3. Run `npm run check` and `npm run format:check`.
4. For demo changes, run `npm run demo` and check desktop and mobile widths.
5. If the demo or bridge placement changes visibly, run `npm run capture` and `npm run examples`.

## Project layout

- `src/xml.ts`, `svg.ts`, `path.ts`, `matrix.ts`: constrained SVG reading, units, transforms and curve flattening.
- `src/bridges.ts`: island detection and bridge placement.
- `src/index.ts`: the public API and SVG output.
- `src/cli.ts`: the command line tool.
- `demo/`: a framework-free consumer of the built package.
- `scripts/`: build, demo server, examples and GIF capture.

## Publishing the demo

`npm run build:site` assembles the demo into `site/`. It is published from the `gh-pages` branch.
