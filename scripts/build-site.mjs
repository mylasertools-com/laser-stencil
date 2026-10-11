import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
await mkdir('site', { recursive: true });
for (const name of await readdir('site'))
  if (name !== '.git') await rm(`site/${name}`, { recursive: true, force: true });
await mkdir('site/dist', { recursive: true });
await cp('demo', 'site/demo', { recursive: true });
await cp('dist/index.js', 'site/dist/index.js');
await writeFile(
  'site/index.html',
  '<!doctype html><meta http-equiv="refresh" content="0;url=./demo/"><a href="./demo/">Laser Stencil demo</a>',
);
await writeFile('site/.nojekyll', '');
console.log('Demo site written to site/');
