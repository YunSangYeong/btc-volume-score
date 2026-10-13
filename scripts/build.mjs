import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/js', { recursive: true });
await cp('site', 'dist', { recursive: true });
await cp('js', 'dist/js', { recursive: true });
console.log('Built static site in dist/');
