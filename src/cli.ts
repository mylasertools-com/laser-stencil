import { readFileSync, writeFileSync } from 'node:fs';
import { stencilSvg, StencilError, type Direction, type SvgStencilOptions } from './index.js';

const help = `Usage: laser-stencil <input.svg|-> [options]

Adds bridges so enclosed pieces stay attached to the stencil sheet.

Options:
  -o, --output <file>     Write the stencil SVG here (default: stdout)
  -w, --width <mm>        Bridge width in mm (default 1.5)
  -b, --bridges <n>       Bridges per island, 1 to 4 (default 2)
  -d, --direction <dir>   vertical, horizontal or auto (default vertical)
      --min-area <mm2>    Let islands smaller than this fall out (default 0)
      --frame <mm>        Add a sheet outline this far outside the design
      --fill              Write filled shapes instead of cut outlines
      --islands           Only report islands; write no SVG
      --json              Print the report as JSON
  -h, --help              Show this help
`;

function main(argv: string[]): number {
  const args = [...argv];
  const options: SvgStencilOptions = {};
  let input: string | undefined,
    output: string | undefined,
    json = false,
    report = false;
  const value = (flag: string) => {
    const v = args.shift();
    if (v === undefined) throw new StencilError('INVALID_ARGUMENT', `${flag} needs a value.`);
    return v;
  };
  const num = (flag: string) => {
    const v = Number(value(flag));
    if (!Number.isFinite(v)) throw new StencilError('INVALID_ARGUMENT', `${flag} needs a number.`);
    return v;
  };
  while (args.length) {
    const a = args.shift()!;
    if (a === '-h' || a === '--help') {
      process.stdout.write(help);
      return 0;
    } else if (a === '-o' || a === '--output') output = value(a);
    else if (a === '-w' || a === '--width') options.bridgeWidth = num(a);
    else if (a === '-b' || a === '--bridges') options.bridges = num(a);
    else if (a === '-d' || a === '--direction') options.direction = value(a) as Direction;
    else if (a === '--min-area') options.minIslandArea = num(a);
    else if (a === '--frame') options.frame = num(a);
    else if (a === '--fill') options.output = 'fill';
    else if (a === '--islands') report = true;
    else if (a === '--json') json = true;
    else if (a.startsWith('-') && a !== '-')
      throw new StencilError('INVALID_ARGUMENT', `Unknown option ${a}.`);
    else if (input === undefined) input = a;
    else throw new StencilError('INVALID_ARGUMENT', 'Only one input file is supported.');
  }
  if (input === undefined) {
    process.stderr.write(help);
    return 2;
  }
  const source = readFileSync(input === '-' ? 0 : input, 'utf8');
  const result = stencilSvg(source, options);
  const summary = {
    islands: result.islands.map(({ polygon: _, ...island }) => island),
    bridges: result.bridges.map(({ polygons: _, ...bridge }) => bridge),
    issues: result.issues,
  };
  if (report || json) {
    const text = json
      ? JSON.stringify(summary, null, 2)
      : `${result.islands.length} island(s), ${result.bridges.length} bridge(s)`;
    (output && !report ? process.stderr : process.stdout).write(text + '\n');
  } else
    process.stderr.write(
      `${result.islands.length} island(s) held by ${result.bridges.length} bridge(s)\n`,
    );
  for (const issue of result.issues) process.stderr.write(`${issue.code}: ${issue.message}\n`);
  if (!report) {
    if (output) writeFileSync(output, result.svg);
    else if (!json) process.stdout.write(result.svg);
  }
  return result.issues.some((i) => i.code === 'UNBRIDGED_ISLAND') ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `laser-stencil: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
