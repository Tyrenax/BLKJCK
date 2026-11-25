/**
 * Jeu de la main : stratégie de base du blackjack (croupier s'arrête sur 17, pas de partage),
 * recalée sur la limite effective, plus les variantes « naïve » et « informée », et la défausse
 * préventive (on défausse AVANT de crever pour repartir d'une meilleure main).
 */
import type { Card, Engine, Rules } from '../../src/engine/types';

export type PlayDecision = 'hit' | 'stand' | 'double';

export interface HandView {
  cards: readonly Card[];
  total: number;
  soft: boolean;
  dealerUp: Card | undefined;
  /** Carte cachée du croupier si elle est visible (Rayons X, Coup d'œil). */
  dealerHole: Card | null;
  /** Prochaine carte de ton sabot si elle est visible (Compteur de cartes, carte marquée). */
  nextCard: Card | null;
  rules: Rules;
  canDouble: boolean;
  /** Défausses encore disponibles à cette table (0 si la défausse est interdite). */
  discardsLeft: number;
  /** Un crevé serait rattrapé (défausse après crevé permise et disponible, Parachute prêt…). */
  bustSafe: boolean;
}

export type DiscardPolicy = 'none' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6';

/**
 * Réglages du simulateur.
 *  - discardAfterBust : règle émulée tant que le moteur n'a pas Rules.discardAfterBust (le robot ne
 *    défausse pas après avoir crevé ; pour lui c'est exactement la même partie).
 *  - discardPolicy : défausse préventive, choisie par simulation (voir --exp defausse).
 */
export const SIM: {
  discardAfterBust: boolean;
  discardPolicy: DiscardPolicy;
  seeHiddenCard: boolean;
  hiddenAssume: Card['rank'];
} = {
  discardAfterBust: false,
  discardPolicy: 'p5',
  /** Expérience « Le Borgne » : le robot triche et voit sa carte face cachée. */
  seeHiddenCard: false,
  /** Rang supposé pour une carte face cachée. */
  hiddenAssume: '7',
};

/** La règle effective : celle du moteur si elle existe, sinon l'émulation du simulateur. */
export function discardAfterBustAllowed(rules: Rules): boolean {
  const r = rules as Rules & { discardAfterBust?: boolean };
  return typeof r.discardAfterBust === 'boolean' ? r.discardAfterBust : SIM.discardAfterBust;
}

/** Tirage quand un crevé serait rattrapé : on tire jusqu'à (limite − marge). Réglé par simulation. */
export const AGGRO = { margin: 4, marginVsWeak: 4 };

export function upValue(c: Card | undefined): number {
  if (!c) return 10;
  if (c.rank === 'A') return 11;
  if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') return 10;
  return Number(c.rank);
}

/** Naïf : tire sous 17 (recalé sur la limite), ne double jamais. */
export function naiveDecision(v: HandView): PlayDecision {
  return v.total < v.rules.playerLimit - 4 ? 'hit' : 'stand';
}

/** Stratégie de base classique, totaux décalés de (limite − 21). */
export function basicDecision(v: HandView): PlayDecision {
  const t = v.total - (v.rules.playerLimit - 21);
  const up = upValue(v.dealerUp);
  const canD = v.canDouble && v.cards.length === 2;
  // Crevé rattrapable : on tire plus loin que la stratégie classique.
  if (v.bustSafe && !(canD && t >= 9 && t <= 11)) {
    const margin = up <= 6 ? AGGRO.marginVsWeak : AGGRO.margin;
    if (!v.soft || t < 18) return v.total < v.rules.playerLimit - margin + 1 ? 'hit' : 'stand';
  }
  if (v.soft) {
    if (t >= 19) return 'stand';
    if (t === 18) {
      if (canD && up >= 3 && up <= 6) return 'double';
      return up >= 9 ? 'hit' : 'stand';
    }
    if (t === 17) return canD && up >= 3 && up <= 6 ? 'double' : 'hit';
    if (t >= 15) return canD && up >= 4 && up <= 6 ? 'double' : 'hit';
    if (t >= 13) return canD && up >= 5 && up <= 6 ? 'double' : 'hit';
    return 'hit';
  }
  if (t >= 17) return 'stand';
  if (t >= 13) return up <= 6 ? 'stand' : 'hit';
  if (t === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (t === 11) return canD && up <= 10 ? 'double' : 'hit';
  if (t === 10) return canD && up <= 9 ? 'double' : 'hit';
  if (t === 9) return canD && up >= 3 && up <= 6 ? 'double' : 'hit';
  return 'hit';
}

/** Décision quand une information est visible (prochaine carte, carte cachée), sinon null. */
export function informedDecision(engine: Engine, v: HandView): PlayDecision | null {
  const limit = v.rules.playerLimit;
  if (v.nextCard) {
    const after = engine.handValue([...v.cards, v.nextCard], limit);
    if (after.bust) return 'stand';
    if (v.total >= limit) return 'stand';
    if (v.canDouble && v.cards.length === 2 && after.total >= limit - 3) return 'double';
    return 'hit';
  }
  if (v.dealerHole && v.dealerUp) {
    const d = engine.handValue([v.dealerUp, v.dealerHole], v.rules.dealerLimit);
    if (d.total >= v.rules.dealerStandOn && !d.bust) {
      // Le croupier est déjà arrêté : il faut le battre, et rester dès qu'on le bat.
      if (v.total > d.total) return 'stand';
      // Égalité : garder la moitié du Mult vaut mieux que tirer (sauf si le croupier gagne les égalités).
      if (v.total === d.total && !v.rules.dealerWinsPush) return 'stand';
      return hitPaysWhenBehind(engine, v, d.total) ? 'hit' : 'stand';
    }
  }
  return null;
}

const RANKS_13: Card['rank'][] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Une victoire vaut environ 3 défaites (Mult moyen ~3 contre 1 : la banque garde ton Mult). */
const WIN_VS_LOSS = 3;

/**
 * Derrière un croupier arrêté : tirer une carte rapporte-t-il plus que la défaite ?
 * Une défaite marque encore ses Jetons (valeur 1), un crevé marque 0, une victoire ~3.
 */
function hitPaysWhenBehind(engine: Engine, v: HandView, dealerTotal: number): boolean {
  let ev = 0;
  for (const rank of RANKS_13) {
    const after = engine.handValue([...v.cards, { id: -1, rank, suit: 'spades' }], v.rules.playerLimit);
    if (after.bust) continue;
    if (after.total > dealerTotal) ev += WIN_VS_LOSS;
    else if (after.total === dealerTotal) ev += v.rules.dealerWinsPush ? 1 : WIN_VS_LOSS / 2;
    else ev += 1;
  }
  return ev / RANKS_13.length > 1;
}

/** Stratégie de base qui se sert de l'information visible (Rayons X, Compteur de cartes…). */
export function basicInformedDecision(engine: Engine, v: HandView): PlayDecision {
  return informedDecision(engine, v) ?? basicDecision(v);
}

/** Stratégie du robot malin : informée, et pousse vers le Charlie quand il est sans risque. */
export function smartDecision(engine: Engine, v: HandView): PlayDecision {
  const info = informedDecision(engine, v);
  if (info) return info;
  if (v.cards.length === v.rules.charlieSize - 1 && v.total <= v.rules.playerLimit - 10) return 'hit';
  return basicDecision(v);
}

/**
 * Défausse préventive : la carte à jeter maintenant pour repartir d'une meilleure main, ou null.
 *  p1 : main dure 12–16 contre une carte haute du croupier (7+) : on garde la plus forte base ≤ 11.
 *  p2 : pareil quelle que soit la carte du croupier.
 *  p3 : p1, plus revenir à 2 cartes totalisant 10 ou 11 pour doubler.
 *  p4 : p3, mais seulement 13–16 (on garde ses défausses pour les cas les plus mauvais).
 *  p5 : p2 + revenir à 2 cartes pour doubler.
 *  p6 : p5 + jeter aussi un 17 dur contre 9, 10 ou As.
 */
export function proactiveDiscard(engine: Engine, v: HandView, policy: DiscardPolicy = SIM.discardPolicy): Card | null {
  if (policy === 'none' || v.discardsLeft <= 0 || v.cards.length < 2 || v.soft || v.nextCard) return null;
  const limit = v.rules.playerLimit;
  const t = v.total - (limit - 21);
  const up = upValue(v.dealerUp);
  const restOf = (c: Card) => v.cards.filter((x) => x.id !== c.id);

  const doubleSetup = policy === 'p3' || policy === 'p4' || policy === 'p5' || policy === 'p6';
  if (doubleSetup && v.cards.length >= 3 && v.rules.canDouble) {
    for (const c of v.cards) {
      const rest = restOf(c);
      if (rest.length !== 2) continue;
      const rv = engine.handValue(rest, limit);
      const rt = rv.total - (limit - 21);
      if (!rv.soft && (rt === 10 || rt === 11) && up <= 10) return c;
    }
  }
  const lo = policy === 'p4' ? 13 : 12;
  const hi = policy === 'p6' && up >= 9 ? 17 : 16;
  if (t < lo || t > hi) return null;
  if ((policy === 'p1' || policy === 'p3' || policy === 'p4') && up < 7) return null;
  let best: { card: Card; total: number } | null = null;
  for (const c of v.cards) {
    const rv = engine.handValue(restOf(c), limit);
    const rt = rv.total - (limit - 21);
    if (rt <= 11 && (!best || rt > best.total)) best = { card: c, total: rt };
  }
  return best?.card ?? null;
}

/**
 * En bustChoice : la carte à défausser qui donne le meilleur total sans crever (null si aucune).
 * Garde toujours au moins une carte.
 */
export function bestDiscard(engine: Engine, cards: readonly Card[], limit: number): Card | null {
  if (cards.length < 2) return null;
  let best: { card: Card; total: number } | null = null;
  for (const c of cards) {
    const rest = cards.filter((x) => x.id !== c.id);
    const v = engine.handValue(rest, limit);
    if (!v.bust && (!best || v.total > best.total)) best = { card: c, total: v.total };
  }
  return best?.card ?? null;
}
