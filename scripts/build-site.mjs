import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
await rm('site', { recursive: true, force: true });
await mkdir('site/dist', { recursive: true });
await cp('demo', 'site/demo', { recursive: true });
await cp('dist/index.js', 'site/dist/index.js');
await writeFile(
  'site/index.html',
  '<!doctype html><meta http-equiv="refresh" content="0;url=./demo/"><a href="./demo/">Laser Stencil demo</a>',
);
await writeFile('site/.nojekyll', '');
console.log('Demo site written to site/');
