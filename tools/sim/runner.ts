/**
 * Joue une partie complète avec un robot et en tire un RunRecord à partir des événements du moteur.
 */
import type { Action, FigureId, GameEvent, RunState, TableKind } from '../../src/engine/types';
import { newMemory, type Bot } from './bots';
import type { SimEngine } from './engine';
import { simRng } from './prng';

export interface TableRecord {
  salon: number;
  kind: TableKind;
  bossId: string | null;
  target: number;
  score: number;
  won: boolean;
  hands: number;
  wins: number;
  pushes: number;
  losses: number;
  busts: number;
  /** Points marqués par des Blackjacks à cette table. */
  bjScore: number;
  bestHand: number;
  handsPerTable: number;
  /** Score de chaque main (0 si crevé). */
  handScores: number[];
}

export interface ShopRecord {
  salon: number;
  money: number;
  bought: number;
  /** Au moins une offre était à la portée de la bourse en entrant. */
  couldBuy: boolean;
}

export interface RunRecord {
  seed: string;
  won: boolean;
  /** Salon atteint (8 + 1 si victoire). */
  salonReached: number;
  tablesWon: number;
  death: { salon: number; kind: TableKind; bossId: string | null } | null;
  tables: TableRecord[];
  shops: ShopRecord[];
  /** Mains marquées et points par figure, par salon : [salon][figure]. */
  figureHands: Record<number, Partial<Record<FigureId, number>>>;
  figurePoints: Record<number, Partial<Record<FigureId, number>>>;
  /** Contribution des atouts (log du rapport Jetons×Mult après/avant), sur les mains gagnées. */
  atoutGain: Record<string, { log: number; hands: number }>;
  atoutsFinal: string[];
  atoutsEver: string[];
  /** Pire cas : plus grand nombre de déclenchements d'une même carte dans une main. */
  maxCardTriggers: number;
  /** Pire cas : plus gros rapport score d'une main / objectif de la table. */
  maxHandRatio: number;
  dispatches: number;
  botErrors: number;
  errorSamples: string[];
}

class Recorder {
  r: RunRecord;
  private table: TableRecord | null = null;
  private shop: ShopRecord | null = null;
  private figure: FigureId | null = null;
  private prev = { c: 0, m: 1 };
  private handGain: Record<string, number> = {};
  private cardSteps = new Map<number, number>();

  constructor(seed: string) {
    this.r = {
      seed,
      won: false,
      salonReached: 1,
      tablesWon: 0,
      death: null,
      tables: [],
      shops: [],
      figureHands: {},
      figurePoints: {},
      atoutGain: {},
      atoutsFinal: [],
      atoutsEver: [],
      maxCardTriggers: 0,
      maxHandRatio: 0,
      dispatches: 0,
      botErrors: 0,
      errorSamples: [],
    };
  }

  consume(before: RunState | null, after: RunState, events: GameEvent[], engine: SimEngine): void {
    const uidToDef = new Map((before ?? after).atouts.map((a) => [a.uid, a.defId]));
    for (const e of events) this.event(e, before ?? after, after, uidToDef, engine);
  }

  private event(e: GameEvent, before: RunState, after: RunState, uidToDef: Map<number, string>, engine: SimEngine): void {
    const r = this.r;
    switch (e.type) {
      case 'tableStarted':
        this.closeShop();
        this.table = {
          salon: e.salon,
          kind: e.kind,
          bossId: e.bossId,
          target: e.target,
          score: 0,
          won: false,
          hands: 0,
          wins: 0,
          pushes: 0,
          losses: 0,
          busts: 0,
          bjScore: 0,
          bestHand: 0,
          handsPerTable: engine.getRules(after).handsPerTable,
          handScores: [],
        };
        r.tables.push(this.table);
        break;
      case 'outcome': {
        const t = this.table;
        if (!t) break;
        t.hands++;
        if (e.outcome === 'win') t.wins++;
        else if (e.outcome === 'push') t.pushes++;
        else if (e.outcome === 'loss') t.losses++;
        else t.busts++;
        break;
      }
      case 'scoreStart':
        this.figure = e.figure;
        this.prev = { c: e.chips, m: e.mult };
        this.handGain = {};
        this.cardSteps.clear();
        break;
      case 'scoreStep': {
        const src = e.source;
        const before = Math.max(1e-9, this.prev.c * this.prev.m);
        const now = Math.max(1e-9, e.chipsAfter * e.multAfter);
        if (src.kind === 'atout') {
          const def = uidToDef.get(src.uid);
          if (def) this.handGain[def] = (this.handGain[def] ?? 0) + Math.log(now / before);
        }
        if (src.kind === 'card') {
          const n = (this.cardSteps.get(src.cardId) ?? 0) + 1;
          this.cardSteps.set(src.cardId, n);
          r.maxCardTriggers = Math.max(r.maxCardTriggers, n);
        }
        this.prev = { c: e.chipsAfter, m: e.multAfter };
        break;
      }
      case 'scoreEnd': {
        const t = this.table;
        const fig = this.figure;
        if (t) {
          t.score = e.tableScore;
          t.handScores.push(e.handScore);
          t.bestHand = Math.max(t.bestHand, e.handScore);
          if (fig === 'blackjack') t.bjScore += e.handScore;
          r.maxHandRatio = Math.max(r.maxHandRatio, e.handScore / Math.max(1, e.target));
        }
        if (fig) {
          const salon = t?.salon ?? before.salon;
          const fh = (r.figureHands[salon] ??= {});
          const fp = (r.figurePoints[salon] ??= {});
          fh[fig] = (fh[fig] ?? 0) + 1;
          fp[fig] = (fp[fig] ?? 0) + e.handScore;
        }
        if (e.outcome === 'win') {
          for (const a of before.atouts) {
            const g = (r.atoutGain[a.defId] ??= { log: 0, hands: 0 });
            g.log += this.handGain[a.defId] ?? 0;
            g.hands++;
          }
        }
        this.figure = null;
        break;
      }
      case 'tableWon':
        if (this.table) this.table.won = true;
        r.tablesWon++;
        break;
      case 'gameOver':
        if (this.table) r.death = { salon: this.table.salon, kind: this.table.kind, bossId: this.table.bossId };
        break;
      case 'victory':
        // Battre le dernier patron mène droit à la victoire, sans événement tableWon.
        r.won = true;
        if (this.table && !this.table.won) {
          this.table.won = true;
          r.tablesWon++;
        }
        break;
      case 'shopEntered': {
        this.closeShop();
        const offers = after.shop?.offers ?? [];
        this.shop = {
          salon: after.salon,
          money: after.money,
          bought: 0,
          couldBuy: offers.some((o) => !o.sold && o.cost <= after.money),
        };
        r.shops.push(this.shop);
        break;
      }
      case 'offerBought':
        if (this.shop) this.shop.bought++;
        break;
      case 'atoutAdded': {
        const id = e.defId;
        if (!r.atoutsEver.includes(id)) r.atoutsEver.push(id);
        break;
      }
      default:
        break;
    }
  }

  private closeShop(): void {
    this.shop = null;
  }

  finish(state: RunState): RunRecord {
    const r = this.r;
    r.salonReached = r.won ? state.salon + 1 : state.salon;
    r.atoutsFinal = state.atouts.map((a) => a.defId);
    return r;
  }
}

export interface RunOptions {
  /** Arrête la partie une fois ce salon battu (calibrage rapide). */
  maxSalon?: number;
  /** Atouts donnés au départ (kit de famille), injectés dans l'état initial. */
  startAtouts?: string[];
}

const FALLBACKS: Action[] = [
  { type: 'leaveShop' },
  { type: 'stand' },
  { type: 'acceptBust' },
  { type: 'nextHand' },
  { type: 'cashOut' },
  { type: 'startTable' },
];

export function playRun(engine: SimEngine, bot: Bot, seed: string, opts: RunOptions = {}): RunRecord {
  const rec = new Recorder(seed);
  const rng = simRng(`bot:${bot.name}:${seed}`);
  const mem = newMemory();
  let { state, events } = engine.newRun(seed);
  for (const id of opts.startAtouts ?? []) {
    const def = engine.atoutById.get(id);
    if (!def) throw new Error(`atout inconnu : ${id}`);
    state.atouts.push({ uid: state.nextUid++, defId: id, state: def.initialState?.() ?? {} });
    rec.r.atoutsEver.push(id);
  }
  rec.consume(null, state, events, engine);
  for (let step = 0; step < 50_000; step++) {
    if (state.phase === 'gameOver' || state.phase === 'victory') break;
    if (opts.maxSalon && state.salon > opts.maxSalon) break;
    let action = bot.decide({ engine, state, rng, mem, options: bot.options });
    let res;
    try {
      res = engine.dispatch(state, action);
    } catch (err) {
      rec.r.botErrors++;
      if (rec.r.errorSamples.length < 5) {
        rec.r.errorSamples.push(`${state.phase} ${JSON.stringify(action)} : ${err instanceof Error ? err.message : err}`);
      }
      const fb = FALLBACKS.find((a) => engine.whyIllegal(state, a) === null);
      if (!fb) throw err;
      action = fb;
      res = engine.dispatch(state, action);
    }
    rec.r.dispatches++;
    rec.consume(state, res.state, res.events, engine);
    state = res.state;
  }
  return rec.finish(state);
}
