import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/js', { recursive: true });
await cp('site', 'dist', { recursive: true });
const files = (await readdir('js')).filter(name => name.endsWith('.js')).sort();
const sources = new Map(await Promise.all(files.map(async name => [name, await readFile(`js/${name}`, 'utf8')])));
const css = await readFile('site/styles.css', 'utf8');
// All module URLs change together, including imports of changed dependencies.
const hash = createHash('sha256');
for (const [name, source] of sources) hash.update(name).update('\0').update(source).update('\0');
hash.update(css);
const version = hash.digest('hex').slice(0, 12);
const assetName = name => name.replace(/\.(js|css)$/, `.${version}.$1`);
for (const [name, source] of sources) {
  const rewritten = source.replace(/(['"])\.\/([^'"]+\.js)\1/g, (match, quote, dependency) => {
    if (!sources.has(dependency)) throw new Error(`Unknown module import: ${dependency}`);
    return `${quote}./${assetName(dependency)}${quote}`;
  });
  await writeFile(`dist/js/${assetName(name)}`, rewritten);
}
await rename('dist/styles.css', `dist/${assetName('styles.css')}`);
const html = await readFile('dist/index.html', 'utf8');
await writeFile('dist/index.html', html.replace('href="styles.css"', `href="${assetName('styles.css')}"`).replace('src="js/app.js"', `src="js/${assetName('app.js')}"`));
console.log(`Built static site in dist/ (asset version ${version})`);
