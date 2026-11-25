/**
 * Robot de test : joue des parties à travers l'interface (même chemin que les clics : game.act),
 * avec n'importe quel moteur. Il joue aussi les cas rares : combines ciblées, ventes, réordonnancement,
 * pots-de-vin, Déchiqueteuse, relances, mode sans fin.
 *   ?bot=1&stop=shop:2&turbo=1        une partie jusqu'à la boutique du salon 2
 *   ?bot=1&seeds=20&turbo=1           20 parties complètes, rapport dans <pre id="bot-report">
 */
import type { Action, RunState } from '../../engine/types';
import { stopClock } from '../core/anim';
import type { Game } from '../game';

interface Memo {
  shopKey: string;
  shopSteps: Set<string>;
  blocked: Set<string>;
  usedCombines: number;
  rnd: number;
  endless: boolean;
}

function stopReached(s: RunState, stop: string | null): boolean {
  if (!stop) return false;
  const [phase, salon] = stop.split(':');
  return s.phase === phase && (salon === undefined || s.salon >= Number(salon));
}

function rand(m: Memo): number {
  m.rnd = (Math.imul(m.rnd, 1103515245) + 12345) >>> 0;
  return (m.rnd >>> 8) / 16777216;
}

const key = (a: Action) => JSON.stringify(a);

function decide(game: Game, s: RunState, m: Memo): Action | null {
  const eng = game.engine;
  const enumerate = (eng as unknown as { enumerateActions?: (s: RunState) => Action[] }).enumerateActions;
  const legal = (enumerate ? enumerate.call(eng, s) : []).filter((a) => !m.blocked.has(key(a)));
  const pick = (type: Action['type']) => legal.find((a) => a.type === type) ?? null;
  const uses = legal.filter((a) => a.type === 'useConsumable');
  switch (s.phase) {
    case 'tableIntro': {
      if (pick('skipTable') && rand(m) < 0.3) return { type: 'skipTable' };
      if (uses.length && rand(m) < 0.5) return uses[0];
      return { type: 'startTable' };
    }
    case 'playerTurn': {
      if (uses.length && m.usedCombines < 40 && rand(m) < 0.35) {
        m.usedCombines++;
        return uses[Math.floor(rand(m) * uses.length)];
      }
      const r = eng.getRules(s);
      const h = s.table!.hand!;
      const v = eng.handValue(h.playerCards, r.playerLimit);
      const dealerUp = eng.handValue(h.dealerCards.slice(0, 1), r.dealerLimit).total;
      const margin = r.playerLimit - v.total;
      if (pick('double') && (v.total === 10 || v.total === 11) && dealerUp < 10) return { type: 'double' };
      if (margin >= 10) return { type: 'hit' };
      if (margin >= 5 && (dealerUp >= 7 || v.soft)) return { type: 'hit' };
      if (margin === 4 && v.soft) return { type: 'hit' };
      if (margin >= 5 && margin <= 9) {
        const d = legal.find((a) => a.type === 'discard');
        if (d && rand(m) < 0.15) return d;
      }
      return { type: 'stand' };
    }
    case 'bustChoice': {
      if (uses.length) return uses[0];
      return pick('discard') ?? { type: 'acceptBust' };
    }
    case 'handResult':
      if (uses.length && rand(m) < 0.3) return uses[0];
      return { type: 'nextHand' };
    case 'tableWon':
      return { type: 'cashOut' };
    case 'shop': {
      const k = `${s.salon}:${s.tableIndex}:${s.shop?.offers.map((o) => o.offerId).join(',')}`;
      if (m.shopKey !== `${s.salon}:${s.tableIndex}`) {
        m.shopKey = `${s.salon}:${s.tableIndex}`;
        m.shopSteps = new Set();
      }
      void k;
      if (uses.length) return uses[0];
      const buys = legal.filter((a) => a.type === 'buy') as Extract<Action, { type: 'buy' }>[];
      const offer = (id: number) => s.shop?.offers.find((o) => o.offerId === id);
      const order = ['atout', 'privilege', 'combine', 'faveur', 'card'];
      buys.sort((a, b) => order.indexOf(offer(a.offerId)?.kind ?? 'card') - order.indexOf(offer(b.offerId)?.kind ?? 'card'));
      if (buys.length) return buys[0];
      const r = eng.getRules(s);
      if (s.atouts.length >= r.atoutSlots && !m.shopSteps.has('sell')) {
        m.shopSteps.add('sell');
        const sell = pick('sellAtout');
        if (sell) return sell;
      }
      if (s.atouts.length >= 2 && !m.shopSteps.has('reorder')) {
        m.shopSteps.add('reorder');
        const ro = pick('reorderAtouts');
        if (ro) return ro;
      }
      if (!m.shopSteps.has('shred')) {
        m.shopSteps.add('shred');
        const sh = legal.find((a) => a.type === 'shredCard');
        if (sh && rand(m) < 0.6) return sh;
      }
      if (!m.shopSteps.has('reroll') && s.money >= 12) {
        m.shopSteps.add('reroll');
        const rr = pick('reroll');
        if (rr) return rr;
      }
      if (!m.shopSteps.has('sellc') && s.consumables.length && rand(m) < 0.2) {
        m.shopSteps.add('sellc');
        const sc = pick('sellConsumable');
        if (sc) return sc;
      }
      return { type: 'leaveShop' };
    }
    case 'victory': {
      const ce = pick('continueEndless');
      if (ce && !m.endless) {
        m.endless = true;
        return ce;
      }
      return null;
    }
    default:
      return null;
  }
}

async function playOne(game: Game, stop: string | null, maxSalon: number, memo: Memo): Promise<void> {
  let fails = 0;
  for (let i = 0; i < 8000; i++) {
    const s = game.state;
    if (!s || stopReached(s, stop)) return;
    if (s.phase === 'gameOver') return;
    if (s.salon > maxSalon) return;
    const a = decide(game, s, memo);
    if (!a) return;
    const ok = await game.act(a);
    if (!ok) {
      memo.blocked.add(key(a));
      if (++fails > 30) {
        game.errors.push(`robot bloqué en ${s.phase} (salon ${s.salon}) sur ${key(a)}`);
        return;
      }
    } else {
      fails = 0;
      memo.blocked.clear();
    }
    if (!game.turbo) await new Promise((r) => setTimeout(r, 120));
  }
}

/** Une partie, jusqu'à un arrêt (?stop=phase[:salon]), avec relance d'autres graines en cas de défaite. */
export async function runBot(game: Game, stop: string | null, turbo: boolean): Promise<void> {
  game.turbo = turbo;
  try {
    let tries = 0;
    for (;;) {
      const s = game.state!;
      const memo: Memo = { shopKey: '', shopSteps: new Set(), blocked: new Set(), usedCombines: 0, rnd: 7 + tries, endless: false };
      await playOne(game, stop, 99, memo);
      const e = game.state;
      if (!e || stopReached(e, stop) || !stop || stop.startsWith('gameOver') || tries++ >= 12 || e.phase !== 'gameOver') break;
      game.screens.end.hide();
      await game.newRun(`${s.seed}-${tries}`);
    }
  } finally {
    game.turbo = false;
    game.render();
  }
}

/** Traversée : N parties complètes, rapport des erreurs et de la couverture des événements. */
export async function runSuite(game: Game, seeds: number, turbo: boolean, maxSalon: number): Promise<void> {
  const capture = (m: string) => game.errors.push(m);
  window.addEventListener('error', (e) => capture(`exception : ${e.error?.stack ?? e.message}`));
  window.addEventListener('unhandledrejection', (e) => capture(`promesse : ${(e.reason as Error)?.stack ?? String(e.reason)}`));
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => {
    capture(`console : ${a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' ')}`);
    ce(...a);
  };
  game.turbo = turbo;
  const results: string[] = [];
  for (let i = 0; i < seeds; i++) {
    const seed = `traversee-${i}`;
    const before = game.errors.length;
    try {
      game.screens.end.hide();
      await game.newRun(seed);
      const memo: Memo = { shopKey: '', shopSteps: new Set(), blocked: new Set(), usedCombines: 0, rnd: 1000 + i, endless: false };
      await playOne(game, null, maxSalon, memo);
    } catch (err) {
      capture(`partie ${seed} : ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }
    const s = game.state;
    results.push(`${seed} : ${s?.phase} salon ${s?.salon} tables ${s?.stats.tablesWon}${s?.endless ? ' (sans fin)' : ''} erreurs ${game.errors.length - before}`);
  }
  game.turbo = false;
  game.render();
  const counts = Object.entries(game.eventCounts).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join(' ');
  const per = Object.entries(game.eventTimes)
    .map(([k, ms]) => [k, ms / (game.eventCounts[k] || 1), ms] as const)
    .sort((a, b) => b[2] - a[2])
    .map(([k, avg, ms]) => `${k} moy ${Math.round(avg)} ms, total ${Math.round(ms / 1000)} s`);
  const acts = Object.entries(game.actionTimes).map(([k, v]) => {
    const sorted = [...v].sort((a, b) => a - b);
    return `${k} : n=${v.length} médiane ${Math.round(sorted[Math.floor(v.length / 2)])} ms, max ${Math.round(sorted[v.length - 1])} ms`;
  });
  const report = ['RAPPORT', ...results, '', `événements : ${counts}`, '', 'durée des actions (temps de jeu) :', ...acts, '', 'durée par événement :', ...per, '', `erreurs (${game.errors.length}) :`, ...game.errors.slice(0, 60)].join('\n');
  const pre = document.createElement('pre');
  pre.id = 'bot-report';
  pre.textContent = report;
  pre.style.cssText = 'position:fixed;left:0;top:0;z-index:999;margin:0;padding:8px;max-height:100%;overflow:hidden;color:var(--ivoire);background:var(--nuit);font:14px "Jersey 15";white-space:pre-wrap';
  document.body.appendChild(pre);
  stopClock();
}
