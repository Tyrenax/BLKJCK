/** Outils de test : truquer le sabot pour obtenir une main précise, rejouer des actions, vérifier les invariants. */
import { createEngine, type SabotEngine } from '../engine';
import type { Action, Card, Content, DispatchResult, GameEvent, Rank, RunState, Suit } from '../types';
import { testContent } from './content';

const SUIT_LETTERS: Record<string, Suit> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

/** « AS » = As de pique, « 10H » = 10 de cœur, « KD » = roi de carreau, « 7C » = 7 de trèfle. */
export function parseSpec(spec: string): { rank: Rank; suit: Suit } {
  const suit = SUIT_LETTERS[spec.slice(-1).toUpperCase()];
  const rank = spec.slice(0, -1).toUpperCase() as Rank;
  if (!suit || !rank) throw new Error(`Carte invalide : ${spec}`);
  return { rank, suit };
}

export const matches = (c: Card, spec: string): boolean => {
  const p = parseSpec(spec);
  return c.rank === p.rank && c.suit === p.suit;
};

export function makeEngine(content: Content = testContent): SabotEngine {
  return createEngine(content);
}

/** Partie lancée (première main distribuée), graine fixe. */
export function startedRun(engine: SabotEngine, seed = 'TEST'): RunState {
  const { state } = engine.newRun(seed);
  return engine.dispatch(state, { type: 'startTable' }).state;
}

function moveToTop(pile: Card[], specs: readonly string[], label: string): void {
  const picked: Card[] = [];
  for (const spec of specs) {
    const idx = pile.findIndex((c) => matches(c, spec) && !picked.includes(c));
    if (idx < 0) throw new Error(`${label} : ${spec} introuvable dans le sabot`);
    picked.push(pile[idx]);
  }
  const rest = pile.filter((c) => !picked.includes(c));
  pile.length = 0;
  pile.push(...picked, ...rest);
}

export interface RigOptions {
  /** Score de table de départ. */
  score?: number;
  /** Mains déjà distribuées avant celle-ci. */
  handsDealt?: number;
  discardsUsed?: number;
}

/**
 * Prépare un state en `handResult` dont la prochaine main (nextHand) distribuera exactement :
 * joueur player[0], croupier dealer[0] (visible), joueur player[1], croupier dealer[1] (cachée),
 * puis player[2..] pour les Tirer et dealer[2..] pour le croupier.
 */
export function rigNextHand(state: RunState, player: readonly string[], dealer: readonly string[], opts: RigOptions = {}): RunState {
  const s = structuredClone(state);
  const t = s.table;
  if (!t || s.phase === 'tableIntro') throw new Error('rigNextHand : il faut une table lancée');
  const dealerCards = [...t.dealerDrawPile, ...(t.dealerDiscardPile ?? [])];
  if (t.hand) {
    const own = new Set(s.deck.map((c) => c.id));
    for (const c of [...t.hand.playerCards, ...t.hand.dealerCards]) if (!own.has(c.id)) dealerCards.push(c);
  }
  t.drawPile = s.deck.map((c) => ({ ...c }));
  t.discardPile = [];
  t.dealerDrawPile = dealerCards;
  t.dealerDiscardPile = [];
  const pOrder = [player[0], player[1], ...player.slice(2)].filter(Boolean);
  const dOrder = [dealer[0], dealer[1], ...dealer.slice(2)].filter(Boolean);
  moveToTop(t.drawPile, pOrder, 'joueur');
  moveToTop(t.dealerDrawPile, dOrder, 'croupier');
  t.hand = {
    playerCards: [],
    dealerCards: [],
    holeRevealed: true,
    hits: 0,
    doubled: false,
    discards: 0,
    mods: [],
    flags: {},
    result: { outcome: 'push', dealerBust: false, playerTotal: 0, dealerTotal: 0, figure: 'petite', chips: 0, mult: 0, score: 0 },
  };
  t.score = opts.score ?? 0;
  t.handsDealt = opts.handsDealt ?? 0;
  t.discardsUsed = opts.discardsUsed ?? 0;
  s.phase = 'handResult';
  return s;
}

/** Distribue une main truquée (voir rigNextHand) et renvoie le résultat du dispatch. */
export function dealRigged(
  engine: SabotEngine,
  state: RunState,
  player: readonly string[],
  dealer: readonly string[],
  opts: RigOptions = {},
): DispatchResult {
  return engine.dispatch(rigNextHand(state, player, dealer, opts), { type: 'nextHand' });
}

/** Ajoute des atouts (sans passer par la boutique). */
export function withAtouts(state: RunState, ...defIds: string[]): RunState {
  const s = structuredClone(state);
  for (const defId of defIds) {
    const def = testContent.atouts.find((a) => a.id === defId);
    s.atouts.push({ uid: s.nextUid++, defId, state: def?.initialState ? def.initialState() : {} });
  }
  return s;
}

export function withConsumables(state: RunState, ...defIds: string[]): RunState {
  const s = structuredClone(state);
  for (const defId of defIds) s.consumables.push({ uid: s.nextUid++, defId });
  return s;
}

/** Donne une amélioration à une carte du deck ET à ses copies sur la table. */
export function withEnhancement(state: RunState, spec: string, enhancement: Card['enhancement']): RunState {
  const s = structuredClone(state);
  const lists: Card[][] = [s.deck];
  if (s.table) lists.push(s.table.drawPile, s.table.discardPile, ...(s.table.hand ? [s.table.hand.playerCards] : []));
  for (const list of lists) for (const c of list) if (matches(c, spec)) c.enhancement = enhancement;
  return s;
}

/** Met la table en cours à la table du patron `bossId` (pour tester un patron sans jouer tout le salon). */
export function atBossTable(state: RunState, bossId: string): RunState {
  const s = structuredClone(state);
  s.bossId = bossId;
  s.tableIndex = 2;
  if (s.table) {
    s.table.kind = 'patron';
    s.table.bossId = bossId;
  }
  return s;
}

export function types(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type);
}

export function ofType<T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** Joue une suite d'actions en partant d'un state ; renvoie le state final et tous les événements. */
export function play(engine: SabotEngine, state: RunState, actions: readonly Action[]): { state: RunState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  for (const a of actions) {
    const r = engine.dispatch(s, a);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** Gèle récursivement un objet (pour vérifier que dispatch ne mute jamais son entrée). */
export function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) deepFreeze(v);
  }
  return x;
}

/**
 * Invariants de conservation des cartes. Renvoie la liste des violations (vide = OK).
 *  - Pendant une table lancée : les cartes du deck sont exactement celles du sabot + défausse + mains.
 *  - Aucune carte en double, nulle part.
 *  - Le croupier a toujours ses 52 cartes de table (sabot + défausse + mains).
 */
export function cardInvariantErrors(s: RunState): string[] {
  const errs: string[] = [];
  const deckIds = s.deck.map((c) => c.id);
  if (new Set(deckIds).size !== deckIds.length) errs.push('deck : ids en double');
  const t = s.table;
  if (!t || s.phase === 'tableIntro') return errs;
  const own = new Set(deckIds);
  const zones = [...t.drawPile, ...t.discardPile, ...(t.dealerDrawPile ?? []), ...(t.dealerDiscardPile ?? [])];
  if (t.hand) zones.push(...t.hand.playerCards, ...t.hand.dealerCards);
  const ids = zones.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errs.push('table : carte en double');
  const playerIds = ids.filter((id) => own.has(id)).sort((a, b) => a - b);
  const sortedDeck = [...deckIds].sort((a, b) => a - b);
  if (JSON.stringify(playerIds) !== JSON.stringify(sortedDeck)) {
    errs.push(`table : cartes du joueur ${playerIds.length} ≠ deck ${sortedDeck.length}`);
  }
  const dealerCount = ids.length - playerIds.length;
  if (dealerCount !== 52) errs.push(`croupier : ${dealerCount} cartes au lieu de 52`);
  // Les copies d'une même carte doivent être identiques au deck.
  const byId = new Map(s.deck.map((c) => [c.id, JSON.stringify(c)]));
  for (const c of zones) if (byId.has(c.id) && byId.get(c.id) !== JSON.stringify(c)) errs.push(`copie divergente : carte ${c.id}`);
  return errs;
}
