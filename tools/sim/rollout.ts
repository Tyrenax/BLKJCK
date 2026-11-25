/**
 * Évaluation d'achats par tables d'essai : pour chaque option, on applique ses actions dans la
 * boutique, on quitte, puis on joue K fois la table suivante dans le VRAI moteur (objectif infini
 * pour voir les 4 mains), avec les mêmes graines pour toutes les options. Le moteur étant pur,
 * rien ne fuit dans la vraie partie.
 */
import type { Action, Card, Rules, RunState } from '../../src/engine/types';
import type { SimEngine } from './engine';
import { hash32, type SimRng } from './prng';
import { bestDiscard, discardAfterBustAllowed, proactiveDiscard, SIM, smartDecision, type HandView } from './strategy';

export interface ShopOption {
  label: string;
  actions: Action[];
  /** Coût net en $ (prix − revente). */
  cost: number;
  /** Utiliser tout de suite le consommable acheté (faveur). */
  useBought?: boolean;
}

/** Poids d'un dollar dépensé, en log de score (≈ 3 % de score par $). */
const LAMBDA = 0.03;
/** Poids d'un dollar gagné pendant la table d'essai. */
const MU = 0.03;

/** Prochaine carte visible (Compteur de cartes ou carte marquée), sans recalculer les règles. */
function visibleTop(state: RunState, rules: Rules): Card | null {
  const top = state.table?.drawPile[0];
  return top && (rules.seeNextCard || top.enhancement === 'marquee') ? top : null;
}

export function handViewOf(engine: SimEngine, state: RunState, known?: Rules): HandView | null {
  const hand = state.table?.hand;
  if (!hand) return null;
  const rules = known ?? engine.getRules(state);
  const hidden = new Set(SIM.seeHiddenCard ? [] : (hand.hiddenCardIds ?? []));
  const cards: Card[] = hand.playerCards.map((c) =>
    hidden.has(c.id) ? { id: c.id, rank: SIM.hiddenAssume, suit: c.suit } : c,
  );
  const v = engine.handValue(cards, rules.playerLimit);
  const holeVisible = hand.holeRevealed || rules.seeDealerHole;
  const discardsLeft = rules.canDiscard ? (state.table?.discardsLeft ?? 0) : 0;
  return {
    cards,
    total: v.total,
    soft: v.soft,
    dealerUp: hand.dealerCards[0],
    dealerHole: holeVisible ? (hand.dealerCards[1] ?? null) : null,
    nextCard: visibleTop(state, rules),
    rules,
    canDouble: rules.canDouble && !hand.doubled && hand.playerCards.length === 2,
    discardsLeft,
    bustSafe: (discardAfterBustAllowed(rules) && discardsLeft > 0) || parachuteReady(state),
  };
}

function parachuteReady(state: RunState): boolean {
  return state.atouts.some((a) => a.defId === 'parachute' && (a.state.used ?? 0) === 0);
}

/**
 * Jeu minimal (sans consommables) pour les tables d'essai. Les règles sont calculées une seule fois ;
 * la légalité n'est pas revérifiée ici : une action refusée retombe sur « rester » (voir quietStep).
 */
function rolloutAction(engine: SimEngine, s: RunState): Action {
  if (s.phase === 'handResult') return { type: 'nextHand' };
  const rules = engine.getRules(s);
  if (s.phase === 'bustChoice') {
    const hand = s.table!.hand!;
    if (discardAfterBustAllowed(rules) && rules.canDiscard && (s.table?.discardsLeft ?? 0) > 0) {
      const c = bestDiscard(engine, hand.playerCards, rules.playerLimit);
      if (c) return { type: 'discard', cardId: c.id };
    }
    return { type: 'acceptBust' };
  }
  const v = handViewOf(engine, s, rules)!;
  const pre = proactiveDiscard(engine, v);
  if (pre) return { type: 'discard', cardId: pre.id };
  const d = smartDecision(engine, v);
  if (d === 'double' && v.canDouble) return { type: 'double' };
  if (d !== 'stand') return { type: 'hit' };
  return { type: 'stand' };
}

/** Un pas de table d'essai sans événements ; une action refusée retombe sur rester / accepter. */
function quietStep(engine: SimEngine, s: RunState, a: Action): RunState | null {
  try {
    return engine.dispatchQuiet(s, a);
  } catch {
    const fallback: Action = s.phase === 'bustChoice' ? { type: 'acceptBust' } : { type: 'stand' };
    try {
      return engine.dispatchQuiet(s, fallback);
    } catch {
      return null;
    }
  }
}

export interface RolloutResult {
  meanScore: number;
  meanMoney: number;
  dispatches: number;
}

export function rolloutTable(engine: SimEngine, shopState: RunState, k: number, salt: number): RolloutResult {
  let dispatches = 0;
  let intro = shopState;
  if (intro.phase === 'shop') {
    intro = engine.dispatchQuiet(intro, { type: 'leaveShop' });
    dispatches++;
  }
  let total = 0;
  let money = 0;
  for (let i = 0; i < k; i++) {
    let s: RunState = { ...intro, rngState: hash32(`${salt}:${i}`) };
    s = engine.dispatchQuiet(s, { type: 'startTable' });
    dispatches++;
    if (s.table) s.table.target = 1e15;
    const m0 = s.money;
    // Objectif infini : la table ne s'arrête jamais avant la dernière main ; on lit son score au fil de l'eau.
    let score = 0;
    for (let guard = 0; guard < 200; guard++) {
      if (s.phase !== 'playerTurn' && s.phase !== 'bustChoice' && s.phase !== 'handResult') break;
      const next = quietStep(engine, s, rolloutAction(engine, s));
      dispatches++;
      if (!next) break;
      s = next;
      score = s.table?.score ?? score;
    }
    total += score;
    money += s.money - m0;
  }
  return { meanScore: total / k, meanMoney: money / k, dispatches };
}

export interface Evaluated {
  option: ShopOption;
  utility: number;
  meanScore: number;
}

/** Renvoie l'option de plus grande utilité (log du score moyen − coût). */
export function evaluateOptions(
  engine: SimEngine,
  state: RunState,
  options: ShopOption[],
  k: number,
  rng: SimRng,
  out?: Evaluated[],
): ShopOption | null {
  const salt = rng.int(0, 0x7fffffff);
  let best: Evaluated | null = null;
  for (const option of options) {
    let s = state;
    try {
      for (const a of option.actions) s = engine.dispatchQuiet(s, a);
      if (option.useBought) {
        const inst = s.consumables[s.consumables.length - 1];
        if (inst) s = engine.dispatchQuiet(s, { type: 'useConsumable', uid: inst.uid, targets: [] });
      }
    } catch {
      continue;
    }
    const r = rolloutTable(engine, s, k, salt);
    const utility = Math.log(Math.max(1, r.meanScore)) - LAMBDA * option.cost + MU * r.meanMoney;
    const ev = { option, utility, meanScore: r.meanScore };
    out?.push(ev);
    if (!best || utility > best.utility) best = ev;
  }
  return best?.option ?? null;
}
