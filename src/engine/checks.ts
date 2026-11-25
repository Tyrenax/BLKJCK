/** Prédicats en lecture seule, partagés par la validation des actions et le déroulé d'une main. */
import { visibleDealerCards } from './core';
import type { Registry } from './registry';
import type { ConsumableDef, ConsumableInstance, ConsumableTargeting, Phase, Rules, RunState } from './types';

export const DEFAULT_MIN_DECK_SIZE = 10;
export const DEFAULT_CARD_OFFER_COST = 4;

export function minDeckSize(reg: Registry): number {
  return reg.content.balance.minDeckSize ?? DEFAULT_MIN_DECK_SIZE;
}

export function discardsLeftOf(s: Readonly<RunState>, r: Readonly<Rules>): number {
  const t = s.table;
  if (!t) return 0;
  return Math.max(0, r.discardsPerTable - (t.discardsUsed ?? 0));
}

/** Cartes ciblables dans une zone. */
export function zoneCardIds(s: Readonly<RunState>, zone: ConsumableTargeting['zone']): number[] {
  if (zone === 'deck') return s.deck.map((c) => c.id);
  const hand = s.table?.hand;
  if (!hand || hand.result) return [];
  if (zone === 'playerHand') return hand.playerCards.map((c) => c.id);
  return visibleDealerCards(hand).map((c) => c.id);
}

/** Pourquoi ce consommable n'est pas jouable maintenant (ou null). `phase` force la phase testée. */
export function consumableIssue(
  reg: Registry,
  s: Readonly<RunState>,
  inst: ConsumableInstance,
  r: Readonly<Rules>,
  phase: Phase = s.phase,
): string | null {
  const def = reg.consumables.get(inst.defId);
  if (!def) return 'Objet inconnu.';
  if (!def.usableIn.includes(phase)) return `« ${def.name} » ne se joue pas maintenant.`;
  if (def.targeting && zoneCardIds(s, def.targeting.zone).length < Math.max(0, def.targeting.min)) {
    return `Pas assez de cartes à cibler pour « ${def.name} ».`;
  }
  if (def.canUse && !def.canUse(s, r)) return `« ${def.name} » est impossible pour l'instant.`;
  return null;
}

/** Valide la liste de cibles fournie pour un consommable. */
export function targetsIssue(s: Readonly<RunState>, def: ConsumableDef, targets: readonly number[]): string | null {
  if (!Array.isArray(targets)) return 'Cibles invalides.';
  const tg = def.targeting;
  if (!tg) return targets.length === 0 ? null : `« ${def.name} » ne prend pas de cible.`;
  if (targets.length < tg.min || targets.length > tg.max) {
    return tg.min === tg.max
      ? `Choisis ${tg.min} carte${tg.min > 1 ? 's' : ''}.`
      : `Choisis entre ${tg.min} et ${tg.max} cartes.`;
  }
  if (new Set(targets).size !== targets.length) return 'Une même carte ne peut pas être choisie deux fois.';
  const allowed = new Set(zoneCardIds(s, tg.zone));
  for (const id of targets) if (!allowed.has(id)) return 'Cette carte ne peut pas être ciblée.';
  return null;
}

/** Le joueur qui vient de crever a-t-il encore un moyen de se sauver ? (testé en phase bustChoice) */
export function canRecover(reg: Registry, s: Readonly<RunState>, r: Readonly<Rules>): boolean {
  const hand = s.table?.hand;
  if (!hand) return false;
  if (r.discardAfterBust && r.canDiscard && discardsLeftOf(s, r) > 0 && hand.playerCards.length >= 2) return true;
  return s.consumables.some((c) => consumableIssue(reg, s, c, r, 'bustChoice') === null);
}
