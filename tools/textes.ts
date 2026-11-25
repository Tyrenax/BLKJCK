/**
 * Pires cas de longueur des textes affichés, par catégorie (audit de mise en page).
 * Lancer : npx tsx tools/textes.ts   (option --all : tous les textes, triés)
 */
import { content } from '../src/content';
import { textEntries, type TextCategory, type TextEntry } from '../src/content/textes';

declare const process: { argv: string[] };

const all = process.argv.includes('--all');
const top = all ? Infinity : 5;
const entries = textEntries(content);
const categories = [...new Set(entries.map((e) => e.category))] as TextCategory[];

const line = (len: number, label: string) => `  ${String(len).padStart(3)}  ${label}`;

for (const cat of categories) {
  const es = entries.filter((e) => e.category === cat);
  const byName = [...es].sort((a, b) => b.name.length - a.name.length).slice(0, top);
  const byText = [...es].sort((a, b) => b.text.length - a.text.length).slice(0, top);
  console.log(`\n## ${cat} (${es.length})`);
  console.log(' Noms les plus longs :');
  for (const e of byName) console.log(line(e.name.length, e.name));
  console.log(' Phrases les plus longues :');
  for (const e of byText) console.log(line(e.text.length, `${e.name} — ${e.text}`));
}

const longest = (f: (e: TextEntry) => number) => Math.max(...entries.map(f));
console.log(`\nMaximum global : nom ${longest((e) => e.name.length)}, phrase ${longest((e) => e.text.length)} caractères.`);
