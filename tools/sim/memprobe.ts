/**
 * Diagnostic mémoire du simulateur : quelques parties du robot malin, mémoire relevée après chacune.
 *   node --expose-gc --max-old-space-size=512 --import tsx tools/sim/memprobe.ts [parties] [tables d'essai]
 */
import { ATOUT_FAMILY, content } from '../../src/content/index';
import { makeBot, setFamilyMap } from './bots';
import { simEngine } from './engine';
import { playRun, type RunRecord } from './runner';

declare const process: { argv: string[]; memoryUsage(): { rss: number; heapUsed: number } };
declare const globalThis: { gc?: () => void };

const runs = Number(process.argv[2] ?? 8);
const rollouts = Number(process.argv[3] ?? 4);
const mb = (x: number) => `${(x / 1048576).toFixed(0)} Mo`;

setFamilyMap(ATOUT_FAMILY);
const engine = simEngine(content);
const bot = makeBot('smart', { rollouts });
const kept: RunRecord[] = [];
let peakRss = 0;
const t0 = performance.now();
for (let i = 0; i < runs; i++) {
  const r = playRun(engine, bot, `mem-${i}`);
  kept.push(r);
  globalThis.gc?.();
  const m = process.memoryUsage();
  peakRss = Math.max(peakRss, m.rss);
  console.log(
    `partie ${i + 1} : salon ${r.salonReached} · ${r.dispatches} actions · tas ${mb(m.heapUsed)} · rss ${mb(m.rss)} · fiche ${(
      JSON.stringify(r).length / 1024
    ).toFixed(0)} Ko`,
  );
}
console.log(`pic rss ${mb(peakRss)} · ${((performance.now() - t0) / runs / 1000).toFixed(2)} s par partie`);
