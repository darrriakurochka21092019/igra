import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const destination = resolve(process.argv[2] ?? 'station-zero.html');
const read = (name, encoding) => readFile(resolve(dist, name), encoding);
const embed = async (name, mediaType) => `data:${mediaType};base64,${(await read(name)).toString('base64')}`;

const template = await read('index.html', 'utf8');
const scriptTag = template.match(/<script type="module"[^>]+src="\.\/([^"]+)"[^>]*><\/script>/);
const styleTag = template.match(/<link rel="stylesheet"[^>]+href="\.\/([^"]+)"[^>]*>/);
if (!scriptTag || !styleTag) {
  throw new Error('Run the production build before packaging the standalone game.');
}

const [script, css, cover, mark, license] = await Promise.all([
  read(scriptTag[1], 'utf8'),
  read(styleTag[1], 'utf8'),
  embed('station-cover.webp', 'image/webp'),
  embed('station-mark.png', 'image/png'),
  read('PHASER-LICENSE.txt', 'utf8'),
]);

const html = template
  .replace(scriptTag[0], () => `<script type="module">\n${script.replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .replace(styleTag[0], () => `<style>\n${css.replace(/(?:\.\.\/|\/)?station-cover\.webp/g, () => cover)}\n</style>`)
  .replace('href="./station-mark.png"', () => `href="${mark}"`)
  .replace('href="./" aria-label="Станция Ноль, главная"', 'href="" aria-label="Станция Ноль, главная"')
  .replace('</head>', () => `<!--\n${license}\n-->\n</head>`);

await writeFile(destination, html);
console.log(destination);
