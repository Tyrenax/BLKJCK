/**
 * Outils des tests d'intégration : le VRAI contenu (src/content) dans le VRAI moteur, avec des sabots
 * truqués. Chaque test vérifie qu'un objet fait ce que dit sa phrase affichée au joueur.
 */
import { content } from '../../content';
import { createEngine } from '../engine';
import { figureBase } from '../figures';
import { dealRigged, matches, type RigOptions, rigNextHand } from '../testing/helpers';
import type { Action, FigureId, GameEvent, HandResult, RunState } from '../types';

export { content };
export const engine = createEngine(content);

/** Jetons et Mult de base d'une figure au niveau 1, lus dans le contenu (robuste au rééquilibrage). */
export const F = (f: FigureId): { chips: number; mult: number } => figureBase(content, f, 1);

/** Table lancée, première main distribuée, argent à 0 sauf précision. */
export function base(seed = 'INTEG', money = 0): RunState {
  const s = structuredClone(engine.dispatch(engine.newRun(seed).state, { type: 'startTable' }).state);
  s.money = money;
  return s;
}

/** Ajoute des atouts du vrai contenu (dans l'ordre donné, gauche -> droite). */
export function give(s: RunState, ...ids: string[]): RunState {
  const c = structuredClone(s);
  for (const id of ids) {
    const def = content.atouts.find((a) => a.id === id);
    if (!def) throw new Error(`atout inconnu : ${id}`);
    c.atouts.push({ uid: c.nextUid++, defId: id, state: def.initialState ? def.initialState() : {} });
  }
  return c;
}

export function giveCons(s: RunState, ...ids: string[]): RunState {
  const c = structuredClone(s);
  for (const id of ids) {
    if (!content.consumables.some((x) => x.id === id)) throw new Error(`consommable inconnu : ${id}`);
    c.consumables.push({ uid: c.nextUid++, defId: id });
  }
  return c;
}

export function setAtoutState(s: RunState, id: string, patch: Record<string, number>): RunState {
  const c = structuredClone(s);
  const a = c.atouts.find((x) => x.defId === id);
  if (!a) throw new Error(`atout absent : ${id}`);
  Object.assign(a.state, patch);
  return c;
}

export const handCardId = (s: RunState, spec: string): number => {
  const c = s.table!.hand!.playerCards.find((x) => matches(x, spec));
  if (!c) throw new Error(`${spec} pas en main`);
  return c.id;
};
export const deckCardId = (s: RunState, spec: string): number => s.deck.find((x) => matches(x, spec))!.id;

export const consUid = (s: RunState, defId: string): number => s.consumables.find((c) => c.defId === defId)!.uid;

export type Step = Action | ((s: RunState) => Action);
export const STAND: Action = { type: 'stand' };
export const HIT: Action = { type: 'hit' };
export const DOUBLE: Action = { type: 'double' };
export const discard = (spec: string): Step => (s) => ({ type: 'discard', cardId: handCardId(s, spec) });
export const use = (defId: string, ...targets: string[]): Step => (s) => ({
  type: 'useConsumable',
  uid: consUid(s, defId),
  targets: targets.map((t) => handCardId(s, t)),
});

export type ScoreStep = Extract<GameEvent, { type: 'scoreStep' }>;

export interface Played {
  state: RunState;
  events: GameEvent[];
  result: HandResult | null;
  steps: ScoreStep[];
  /** Variation d'argent depuis le state de départ. */
  money: number;
}

/** Joue des actions en partant d'un state, en accumulant les événements. */
export function run(s0: RunState, steps: readonly Step[]): Played {
  let state = s0;
  const events: GameEvent[] = [];
  for (const st of steps) {
    const a = typeof st === 'function' ? st(state) : st;
    const r = engine.dispatch(state, a);
    state = r.state;
    events.push(...r.events);
  }
  return finish(s0, state, events);
}

function finish(s0: RunState, state: RunState, events: GameEvent[]): Played {
  return {
    state,
    events,
    result: state.table?.hand?.result ?? null,
    steps: events.filter((e): e is ScoreStep => e.type === 'scoreStep'),
    money: state.money - s0.money,
  };
}

/** Distribue une main truquée (voir rigNextHand) puis joue `steps` (par défaut : rester). */
export function hand(
  s0: RunState,
  player: readonly string[],
  dealer: readonly string[],
  steps: readonly Step[] = [STAND],
  opts: RigOptions = {},
): Played {
  const dealt = dealRigged(engine, s0, player, dealer, opts);
  const rest = run(dealt.state, steps);
  return finish(s0, rest.state, [...dealt.events, ...rest.events]);
}

/**
 * Enchaîne une autre main truquée sur la même table (compteurs d'atouts conservés). Le score de table
 * est remis à 0 pour que l'objectif ne termine pas la table avant la main voulue.
 */
export function nextRigged(p: Played, player: readonly string[], dealer: readonly string[], steps: readonly Step[] = [STAND]): Played {
  const t = p.state.table!;
  const rigged = rigNextHand(p.state, player, dealer, { score: 0, handsDealt: t.handsDealt, discardsUsed: t.discardsUsed });
  const r = run(rigged, [{ type: 'nextHand' }, ...steps]);
  return { ...r, events: [...p.events, ...r.events], money: r.state.money - (p.state.money - p.money) };
}

/** Gagne la table en cours avec une main gagnante (objectif atteint à la 2e main) : state en tableWon. */
export function winTable(s0: RunState): Played {
  const target = s0.table!.target;
  const p = hand(s0, ['10H', '9S'], ['10C', '7D'], [STAND, { type: 'nextHand' }], { score: target - 1, handsDealt: 1 });
  if (p.state.phase !== 'tableWon' && p.state.phase !== 'victory') throw new Error(`winTable : phase ${p.state.phase}`);
  return p;
}

/** Une boutique (après la petite table), argent fixé. */
export function toShop(s0: RunState, money = 100): RunState {
  const won = winTable(s0).state;
  const shop = structuredClone(engine.dispatch(won, { type: 'cashOut' }).state);
  shop.money = money;
  return shop;
}

/** Achète un privilège en l'injectant comme offre dans la boutique. */
export function buyPrivilege(shop: RunState, defId: string): Played {
  const s = structuredClone(shop);
  const def = content.privileges.find((p) => p.id === defId)!;
  s.shop!.offers.push({ offerId: 9999, kind: 'privilege', defId, cost: def.cost, sold: false });
  return run(s, [{ type: 'buy', offerId: 9999 }]);
}

/** Main de référence : 10♥ 9♠ (19, Main haute) contre 10♣ 7♦ (17) -> victoire. */
export const REF = { player: ['10H', '9S'], dealer: ['10C', '7D'] } as const;
/** Jetons de la main de référence avant atouts. */
export const REF_CHIPS = (): number => F('haute').chips + 19;

export { atBossTable as atBossTableReal } from '../testing/helpers';
