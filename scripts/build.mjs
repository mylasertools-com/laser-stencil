import { readdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const banner = {
  js: '/*! @mylasertools/laser-stencil | MIT. Includes Clipper2 (Angus Johnson; TS port Jeremy Tribby), BSL-1.0. See THIRD-PARTY-NOTICES.md. */',
};
for (const format of ['esm', 'cjs'])
  await build({
    entryPoints: ['src/index.ts'],
    outfile: `dist/index.${format === 'esm' ? 'js' : 'cjs'}`,
    bundle: true,
    minify: true,
    format,
    platform: 'neutral',
    target: 'es2020',
    banner,
  });
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
});
for (const name of await readdir('dist')) {
  if (!name.endsWith('.d.ts')) continue;
  const text = await readFile('dist/' + name, 'utf8');
  await writeFile('dist/' + name.replace('.d.ts', '.d.cts'), text.replaceAll(".js'", ".cjs'"));
}
