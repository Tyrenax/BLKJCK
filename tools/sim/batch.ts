/** Lot de parties : un moteur par contenu (createEngine lit la balance une fois), un robot, N graines. */
import type { Content } from '../../src/engine/types';
import { makeBot, type BotName, type BotOptions } from './bots';
import { simEngine } from './engine';
import { playRun, type RunRecord } from './runner';

export function runBatch(
  c: Content,
  bot: BotName,
  opts: BotOptions,
  runs: number,
  seed: string,
  maxSalon?: number,
  startAtouts?: string[],
) {
  const engine = simEngine(c);
  const b = makeBot(bot, opts);
  const out: RunRecord[] = [];
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) out.push(playRun(engine, b, `${seed}-${i}`, { maxSalon, startAtouts }));
  return { runs: out, ms: performance.now() - t0 };
}
