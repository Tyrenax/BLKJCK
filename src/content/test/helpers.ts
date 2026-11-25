/**
 * Fabrique de contextes pour tester les crochets du contenu SANS le moteur :
 * cartes, RunState minimal, ScoringContext, HookContext, MutationApi espion, Rng scripté.
 */
import type {
  AtoutDef,
  AtoutInstance,
  BossDef,
  Card,
  EnhancementId,
  FigureId,
  HandResult,
  HandState,
  HookContext,
  MutationApi,
  Outcome,
  Rank,
  Rng,
  RunState,
  Rules,
  ScoreEffect,
  ScoringContext,
  Suit,
  TableState,
} from '../../engine/types';
import { baseRules } from '../balance';
import { effectsOf, handTotal } from '../util';

let nextId = 1;

const SUIT_OF: Record<string, Suit> = { h: 'hearts', d: 'diamonds', s: 'spades', c: 'clubs' };

/** card('7h'), card('10s'), card('Kd', 'plombee'). Rangs : A 2..10 J Q K. */
export function card(spec: string, enhancement?: EnhancementId): Card {
  const suit = SUIT_OF[spec.slice(-1)];
  const rank = spec.slice(0, -1).toUpperCase() as Rank;
  if (!suit) throw new Error(`carte invalide : ${spec}`);
  const c: Card = { id: nextId++, rank, suit };
  if (enhancement) c.enhancement = enhancement;
  return c;
}

export function cards(...specs: string[]): Card[] {
  return specs.map((s) => card(s));
}

export function fullDeck(): Card[] {
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const out: Card[] = [];
  for (const s of ['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]) {
    for (const r of ranks) out.push({ id: nextId++, rank: r, suit: s });
  }
  return out;
}

export function makeRules(over: Partial<Rules> = {}): Rules {
  return { ...(baseRules as Rules), ...over };
}

export interface StateOpts {
  money?: number;
  atouts?: AtoutInstance[];
  deck?: Card[];
  table?: Partial<TableState> | null;
  hand?: Partial<HandState> | null;
}

export function makeState(o: StateOpts = {}): RunState {
  const hand: HandState | null =
    o.hand === null
      ? null
      : {
          playerCards: [],
          dealerCards: [],
          holeRevealed: false,
          hits: 0,
          doubled: false,
          discards: 0,
          mods: [],
          flags: {},
          result: null,
          ...o.hand,
        };
  const table: TableState | null =
    o.table === null
      ? null
      : {
          kind: 'petite',
          bossId: null,
          target: 150,
          score: 0,
          handIndex: 0,
          handsLeft: 3,
          discardsLeft: 2,
          drawPile: [],
          discardPile: [],
          dealerDrawPile: [],
          mods: [],
          flags: {},
          hand,
          ...o.table,
        };
  return {
    version: 1,
    seed: 'test',
    rngState: 0,
    phase: 'playerTurn',
    salon: 1,
    tableIndex: 0,
    bossId: 'le-tricheur',
    money: o.money ?? 0,
    deck: o.deck ?? fullDeck(),
    atouts: o.atouts ?? [],
    consumables: [],
    privileges: [],
    figureLevels: { blackjack: 1, triple7: 1, charlie: 1, pile: 1, couleur: 1, paire: 1, haute: 1, petite: 1 },
    runMods: [],
    table,
    shop: null,
    nextCardId: 10_000,
    nextUid: 100,
    stats: {
      handsPlayed: 0,
      handsWon: 0,
      busts: 0,
      dealerBusts: 0,
      blackjacks: 0,
      bestHandScore: 0,
      tablesWon: 0,
    },
    flags: {},
  };
}

/** Rng scripté : renvoie les valeurs dans l'ordre (en boucle). chance(p) = next() < p. */
export function fakeRng(values: number[] = [0.5]): Rng {
  let i = 0;
  const next = () => values[i++ % values.length] ?? 0.5;
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    shuffle: (items) => items,
  };
}

export interface Call {
  fn: keyof MutationApi;
  args: unknown[];
}

export interface FakeApi extends MutationApi {
  calls: Call[];
  argsOf(fn: keyof MutationApi): unknown[][];
  moneyDelta(): number;
}

/** MutationApi espion. Les actions de sabot lisent/modifient le drawPile du state fourni. */
export function fakeApi(state: RunState): FakeApi {
  const calls: Call[] = [];
  const flags: Record<string, number> = {};
  const rec = (fn: keyof MutationApi, ...args: unknown[]) => calls.push({ fn, args });
  const pile = () => state.table?.drawPile ?? [];
  const api: FakeApi = {
    calls,
    argsOf: (fn) => calls.filter((c) => c.fn === fn).map((c) => c.args),
    moneyDelta: () => calls.filter((c) => c.fn === 'addMoney').reduce((s, c) => s + (c.args[0] as number), 0),
    addMoney: (amount, reason) => rec('addMoney', amount, reason),
    addRuleMod: (scope, mod) => rec('addRuleMod', scope, mod),
    levelUpFigure: (figure, levels) => rec('levelUpFigure', figure, levels),
    enhanceCard: (id, e) => rec('enhanceCard', id, e),
    changeSuit: (id, s) => rec('changeSuit', id, s),
    changeRank: (id, r) => rec('changeRank', id, r),
    destroyCard: (id, reason) => rec('destroyCard', id, reason),
    addCard: (c, toDrawPile) => {
      rec('addCard', c, toDrawPile);
      return { ...c, id: nextId++ };
    },
    duplicateCard: (id) => {
      rec('duplicateCard', id);
      return { id: nextId++, rank: 'A', suit: 'spades' };
    },
    drawToPlayer: () => {
      rec('drawToPlayer');
      return pile().shift() ?? null;
    },
    discardFromHand: (id) => rec('discardFromHand', id),
    burnTop: (owner) => {
      rec('burnTop', owner);
      return owner === 'player' ? (pile().shift() ?? null) : null;
    },
    peek: (owner, count) => {
      rec('peek', owner, count);
      const src = owner === 'player' ? pile() : (state.table?.dealerDrawPile ?? []);
      return src.slice(0, count);
    },
    revealHole: () => rec('revealHole'),
    swapWithDealer: (p, d) => rec('swapWithDealer', p, d),
    addAtout: (defId) => {
      rec('addAtout', defId);
      return null;
    },
    removeAtout: (uid) => rec('removeAtout', uid),
    addConsumable: (defId) => {
      rec('addConsumable', defId);
      return null;
    },
    setFlag: (scope, key, value) => {
      rec('setFlag', scope, key, value);
      flags[`${scope}:${key}`] = value;
    },
    getFlag: (scope, key) => flags[`${scope}:${key}`] ?? 0,
    trigger: (text) => rec('trigger', text),
    emit: (event) => rec('emit', event),
  };
  return api;
}

export function instance(def: AtoutDef, uid = 1): AtoutInstance {
  return { uid, defId: def.id, state: def.initialState?.() ?? {} };
}

export interface HookOpts {
  state?: RunState;
  rules?: Partial<Rules>;
  self?: AtoutInstance | null;
  rng?: Rng;
}

export function hookCtx(o: HookOpts = {}): HookContext & { api: FakeApi } {
  const state = o.state ?? makeState();
  return { state, rules: makeRules(o.rules), rng: o.rng ?? fakeRng(), self: o.self ?? null, api: fakeApi(state) };
}

export interface ScoreOpts {
  cards?: Card[];
  dealer?: Card[];
  playerTotal?: number;
  dealerTotal?: number;
  outcome?: Outcome;
  dealerBust?: boolean;
  figure?: FigureId;
  figures?: FigureId[];
  hits?: number;
  doubled?: boolean;
  discards?: number;
  chips?: number;
  mult?: number;
  rules?: Partial<Rules>;
  state?: RunState;
  self?: AtoutInstance | null;
  rng?: Rng;
}

export function scoringCtx(o: ScoreOpts = {}): ScoringContext {
  const rules = makeRules(o.rules);
  const playerCards = o.cards ?? cards('10s', '8h');
  const dealerCards = o.dealer ?? cards('10c', '7d');
  const playerTotal = o.playerTotal ?? handTotal(playerCards, rules.playerLimit).total;
  const dealerTotal = o.dealerTotal ?? handTotal(dealerCards, 99).total;
  const dealerBust = o.dealerBust ?? dealerTotal > rules.dealerLimit;
  const margin = playerTotal - (dealerBust ? 0 : dealerTotal);
  const outcome: Outcome = o.outcome ?? (margin > 0 ? 'win' : margin === 0 ? 'push' : 'loss');
  const figure = o.figure ?? 'haute';
  return {
    state: o.state ?? makeState({ hand: { playerCards, dealerCards } }),
    rules,
    rng: o.rng ?? fakeRng(),
    self: o.self ?? null,
    playerCards,
    dealerCards,
    playerTotal,
    dealerTotal,
    margin,
    outcome,
    dealerBust,
    figure,
    figures: o.figures ?? [figure],
    hits: o.hits ?? 0,
    doubled: o.doubled ?? false,
    discards: o.discards ?? 0,
    chips: o.chips ?? 40,
    mult: o.mult ?? 2,
  };
}

/** Reproduit la partie « contenu » de la cascade : cartes (avec re-déclenchements), puis main. */
export function runScoring(def: AtoutDef | BossDef, ctx: ScoringContext): ScoreEffect[] {
  const out: ScoreEffect[] = [];
  const h = def.hooks;
  for (const c of ctx.playerCards) {
    if (h.isCardDebuffed?.(c, ctx.state)) continue;
    const times = 1 + (h.retriggers?.(ctx, c) ?? 0);
    for (let t = 0; t < times; t++) out.push(...effectsOf(h.onCardScored?.(ctx, c)));
  }
  out.push(...effectsOf(h.onHandScored?.(ctx)));
  return out;
}

/**
 * Cascade minimale de plusieurs définitions, de gauche à droite, avec le verdict du moteur
 * (égalité/défaite : Mult × part gardée, jamais sous 1) et nullify. Renvoie le score final.
 */
export function cascadeScore(defs: (AtoutDef | BossDef)[], o: ScoreOpts & { baseChips?: number; baseMult?: number }): number {
  let chips = o.baseChips ?? 20;
  let mult = o.baseMult ?? 2;
  let nullified = false;
  const apply = (e: ScoreEffect) => {
    chips = Math.max(0, chips + (e.chips ?? 0));
    mult += e.mult ?? 0;
    mult *= e.xMult ?? 1;
    if (e.nullify) nullified = true;
  };
  const ctxNow = () => scoringCtx({ ...o, chips, mult });
  const ctx0 = ctxNow();
  for (const c of ctx0.playerCards) {
    chips += handTotal([c], 99).total;
    for (const d of defs) effectsOf(d.hooks.onCardScored?.(ctxNow(), c)).forEach(apply);
  }
  for (const d of defs) effectsOf(d.hooks.onHandScored?.(ctxNow())).forEach(apply);
  const r = ctx0.rules;
  if (ctx0.outcome === 'push') mult = Math.max(1, mult * r.pushMultKeep);
  if (ctx0.outcome === 'loss') mult = Math.max(1, mult * r.lossMultKeep);
  if (ctx0.outcome === 'bust' || nullified) return 0;
  return Math.floor(chips * mult);
}

/** Somme des effets : Jetons et Mult additionnés, xMult multipliés, argent additionné. */
export interface Totals {
  chips: number;
  mult: number;
  xMult: number;
  money: number;
}

export function sum(effects: ScoreEffect[]): Totals {
  return effects.reduce<Totals>(
    (acc, e) => ({
      chips: acc.chips + (e.chips ?? 0),
      mult: acc.mult + (e.mult ?? 0),
      xMult: acc.xMult * (e.xMult ?? 1),
      money: acc.money + (e.money ?? 0),
    }),
    { chips: 0, mult: 0, xMult: 1, money: 0 },
  );
}

/** Applique modifyRules d'une définition sur un brouillon neuf. */
export function rulesWith(
  def: AtoutDef | BossDef,
  o: { self?: AtoutInstance | null; state?: RunState; base?: Partial<Rules> } = {},
): Rules {
  const r = makeRules(o.base);
  def.hooks.modifyRules?.(r, o.self ?? null, o.state ?? makeState());
  return r;
}

export function result(over: Partial<HandResult> = {}): HandResult {
  return {
    outcome: 'win',
    dealerBust: false,
    playerTotal: 20,
    dealerTotal: 18,
    figure: 'haute',
    chips: 40,
    mult: 2,
    score: 80,
    ...over,
  };
}

/** Trouve une définition par id (échoue bruyamment). */
export function byId<T extends { id: string }>(list: readonly T[], id: string): T {
  const d = list.find((x) => x.id === id);
  if (!d) throw new Error(`introuvable : ${id}`);
  return d;
}
