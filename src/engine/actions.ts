/**
 * Validation des actions (whyIllegal, textes affichables en français), énumération des actions
 * concrètes jouables, et application d'une action validée sur le brouillon.
 */
import { consumableIssue, discardsLeftOf, minDeckSize, targetsIssue, zoneCardIds } from './checks';
import { type Ctx, emit, HookError, hookContext, playerCanDraw, rulesOf } from './core';
import type { Registry } from './registry';
import { computeRules } from './rules';
import {
  adjustShopAllowances,
  buy,
  leaveShop,
  reroll,
  sellAtout,
  sellConsumable,
  shred,
} from './shop';
import {
  cashOut,
  continueEndless,
  double,
  hit,
  nextHand,
  playerDiscard,
  resolveBust,
  resolveStand,
  settle,
  skipTable,
  startTable,
} from './table';
import type { Action, ActionType, Phase, Rules, RunState } from './types';

export const ACTION_TYPES: readonly ActionType[] = [
  'startTable',
  'hit',
  'stand',
  'double',
  'discard',
  'acceptBust',
  'nextHand',
  'cashOut',
  'buy',
  'sellAtout',
  'sellConsumable',
  'reroll',
  'shredCard',
  'useConsumable',
  'reorderAtouts',
  'leaveShop',
  'skipTable',
  'continueEndless',
];

const IN_HAND: readonly Phase[] = ['playerTurn', 'bustChoice'];

export function whyIllegal(reg: Registry, s: Readonly<RunState>, a: Action): string | null {
  if (!a || typeof a !== 'object' || typeof a.type !== 'string') return 'Action invalide.';
  if (!ACTION_TYPES.includes(a.type)) return 'Action inconnue.';
  if (s.phase === 'gameOver') return 'La partie est terminée.';
  if (s.phase === 'victory') {
    if (a.type !== 'continueEndless') return 'La partie est terminée.';
    return s.endless || !s.table ? 'Le mode sans fin est déjà lancé.' : null;
  }
  const t = s.table;
  const hand = t?.hand ?? null;
  // Règles calculées à la demande : la plupart des refus n'en ont pas besoin.
  let cached: Rules | null = null;
  const rules = (): Rules => (cached ??= computeRules(reg, s));

  switch (a.type) {
    case 'startTable':
      return s.phase === 'tableIntro' && t ? null : 'Aucune table à lancer pour le moment.';

    case 'hit':
      if (s.phase !== 'playerTurn' || !hand) return 'Tu ne peux tirer que pendant ton tour.';
      if (!playerCanDraw(s)) return 'Ton sabot est vide.';
      return null;

    case 'stand':
      return s.phase === 'playerTurn' && hand ? null : 'Tu ne peux rester que pendant ton tour.';

    case 'double':
      if (s.phase !== 'playerTurn' || !hand) return 'Tu ne peux doubler que pendant ton tour.';
      if (!rules().canDouble) return 'Doubler est interdit à cette table.';
      if (hand.doubled) return 'Tu as déjà doublé.';
      if (hand.playerCards.length !== 2) return "On ne double qu'avec deux cartes en main.";
      if (!playerCanDraw(s)) return 'Ton sabot est vide.';
      return null;

    case 'discard':
      if (!IN_HAND.includes(s.phase) || !hand) return 'Tu ne peux défausser que pendant ta main.';
      if (s.phase === 'bustChoice' && !rules().discardAfterBust) return 'Trop tard : on défausse avant de crever.';
      if (!rules().canDiscard) return 'Défausser est interdit à cette table.';
      if (discardsLeftOf(s, rules()) <= 0) return 'Plus de défausse pour cette table.';
      if (!hand.playerCards.some((c) => c.id === a.cardId)) return "Cette carte n'est pas dans ta main.";
      if (hand.playerCards.length < 2) return 'Garde au moins une carte en main.';
      return null;

    case 'acceptBust':
      return s.phase === 'bustChoice' ? null : "Tu n'as pas crevé.";

    case 'nextHand':
      return s.phase === 'handResult' ? null : "La main n'est pas terminée.";

    case 'cashOut':
      return s.phase === 'tableWon' && t ? null : 'Rien à encaisser pour le moment.';

    case 'buy': {
      if (s.phase !== 'shop' || !s.shop) return 'La boutique est fermée.';
      const offer = s.shop.offers.find((o) => o.offerId === a.offerId);
      if (!offer) return 'Cette offre n’existe pas.';
      if (offer.sold) return 'Déjà vendu.';
      if (s.money < offer.cost) return `Pas assez d'argent (il manque ${offer.cost - s.money} $).`;
      if (offer.kind === 'atout') {
        if (!reg.atouts.has(offer.defId)) return 'Atout inconnu.';
        if (s.atouts.length >= rules().atoutSlots) return "Plus d'emplacement d'atout : vends-en un d'abord.";
      }
      if (offer.kind === 'combine' || offer.kind === 'faveur') {
        if (!reg.consumables.has(offer.defId)) return 'Objet inconnu.';
        if (s.consumables.length >= rules().consumableSlots) return "Plus d'emplacement de consommable.";
      }
      if (offer.kind === 'privilege' && !reg.privileges.has(offer.defId)) return 'Privilège inconnu.';
      if (offer.kind === 'card' && !offer.card) return 'Carte introuvable.';
      return null;
    }

    case 'sellAtout':
    case 'sellConsumable': {
      if (IN_HAND.includes(s.phase)) return 'On ne vend rien en pleine main.';
      const list = a.type === 'sellAtout' ? s.atouts : s.consumables;
      if (!list.some((x) => x.uid === a.uid)) return a.type === 'sellAtout' ? 'Atout introuvable.' : 'Objet introuvable.';
      return null;
    }

    case 'reroll':
      if (s.phase !== 'shop' || !s.shop) return 'La boutique est fermée.';
      if (s.money < s.shop.rerollCost) return `Pas assez d'argent pour relancer (${s.shop.rerollCost} $).`;
      return null;

    case 'shredCard':
      if (s.phase !== 'shop' || !s.shop) return 'La Déchiqueteuse est en boutique.';
      if (s.shop.shredsLeft <= 0) return 'Déchiqueteuse déjà utilisée dans cette boutique.';
      if (s.money < s.shop.shredCost) return `Pas assez d'argent (${s.shop.shredCost} $).`;
      if (!s.deck.some((c) => c.id === a.cardId)) return "Cette carte n'est pas dans ton sabot.";
      if (s.deck.length <= minDeckSize(reg)) return `Ton sabot ne peut pas descendre sous ${minDeckSize(reg)} cartes.`;
      return null;

    case 'useConsumable': {
      const inst = s.consumables.find((c) => c.uid === a.uid);
      if (!inst) return 'Objet introuvable.';
      const issue = consumableIssue(reg, s, inst, rules());
      if (issue) return issue;
      return targetsIssue(s, reg.consumables.get(inst.defId)!, a.targets ?? []);
    }

    case 'reorderAtouts': {
      const order = a.order;
      if (!Array.isArray(order) || order.length !== s.atouts.length) return "L'ordre doit contenir chaque atout une fois.";
      const uids = new Set(s.atouts.map((x) => x.uid));
      if (new Set(order).size !== order.length || !order.every((u) => uids.has(u))) {
        return "L'ordre doit contenir chaque atout une fois.";
      }
      return null;
    }

    case 'leaveShop':
      return s.phase === 'shop' ? null : "Tu n'es pas en boutique.";

    case 'skipTable': {
      if (s.phase !== 'tableIntro' || !t) return "Le pot-de-vin se négocie avant de s'asseoir.";
      if (t.kind === 'patron') return 'On ne soudoie pas le patron.';
      const rewardId = s.salonSkipRewards?.[s.tableIndex];
      if (!rewardId || !reg.skipRewards.has(rewardId)) return 'Personne à soudoyer à cette table.';
      return null;
    }

    case 'continueEndless':
      return 'Le mode sans fin s’ouvre après avoir battu le dernier patron.';
  }
}

/** Ensembles de cibles proposés pour un consommable (pas exhaustif quand le choix est large). */
function targetCandidates(reg: Registry, s: Readonly<RunState>, defId: string): number[][] {
  const def = reg.consumables.get(defId);
  if (!def?.targeting) return [[]];
  const ids = zoneCardIds(s, def.targeting.zone);
  const { min, max } = def.targeting;
  const out: number[][] = [];
  const seen = new Set<string>();
  const add = (set: number[]): void => {
    const key = set.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(set);
    }
  };
  if (min <= 1 && max >= 1) for (const id of ids) add([id]);
  for (let k = Math.max(0, min); k <= Math.min(max, ids.length); k++) {
    add(ids.slice(0, k));
    add(ids.slice(ids.length - k));
  }
  return out;
}

/** Toutes les actions concrètes jouables (pour le simulateur, les tests, un éventuel robot). */
export function enumerateActions(reg: Registry, s: Readonly<RunState>): Action[] {
  const c: Action[] = [];
  const simple = [
    'startTable',
    'skipTable',
    'hit',
    'stand',
    'double',
    'acceptBust',
    'nextHand',
    'cashOut',
    'reroll',
    'leaveShop',
    'continueEndless',
  ] as const;
  for (const type of simple) {
    c.push({ type });
  }
  const hand = s.table?.hand;
  if (hand && IN_HAND.includes(s.phase)) for (const card of hand.playerCards) c.push({ type: 'discard', cardId: card.id });
  if (s.phase === 'shop' && s.shop) {
    for (const o of s.shop.offers) c.push({ type: 'buy', offerId: o.offerId });
    if (s.deck.length && whyIllegal(reg, s, { type: 'shredCard', cardId: s.deck[0].id }) === null) {
      for (const card of s.deck) c.push({ type: 'shredCard', cardId: card.id });
    }
  }
  for (const a of s.atouts) c.push({ type: 'sellAtout', uid: a.uid });
  for (const x of s.consumables) {
    c.push({ type: 'sellConsumable', uid: x.uid });
    for (const targets of targetCandidates(reg, s, x.defId)) c.push({ type: 'useConsumable', uid: x.uid, targets });
  }
  if (s.atouts.length >= 2) c.push({ type: 'reorderAtouts', order: s.atouts.map((a) => a.uid).reverse() });
  return c.filter((a) => whyIllegal(reg, s, a) === null);
}

export function legalActions(reg: Registry, s: Readonly<RunState>): ActionType[] {
  const types = new Set(enumerateActions(reg, s).map((a) => a.type));
  return ACTION_TYPES.filter((t) => types.has(t));
}

function useConsumable(ctx: Ctx, uid: number, targets: number[]): void {
  const s = ctx.s;
  const idx = s.consumables.findIndex((c) => c.uid === uid);
  const [inst] = s.consumables.splice(idx, 1);
  const def = ctx.reg.consumables.get(inst.defId)!;
  emit(ctx, { type: 'consumableUsed', uid, defId: def.id });
  try {
    def.use.call(def, hookContext(ctx, null), [...targets]);
  } catch (e) {
    if (e instanceof HookError) throw e;
    throw new HookError(`Consommable « ${def.name} » : ${e instanceof Error ? e.message : String(e)}`, e);
  }
  ctx.seq++;
  settle(ctx);
}

/** Applique une action DÉJÀ validée au brouillon. */
export function applyAction(ctx: Ctx, a: Action): void {
  const shopRulesBefore = ctx.s.phase === 'shop' ? rulesOf(ctx) : null;
  switch (a.type) {
    case 'startTable':
      startTable(ctx);
      break;
    case 'hit':
      hit(ctx);
      break;
    case 'stand':
      resolveStand(ctx);
      break;
    case 'double':
      double(ctx);
      break;
    case 'discard':
      playerDiscard(ctx, a.cardId);
      break;
    case 'acceptBust':
      resolveBust(ctx);
      break;
    case 'nextHand':
      nextHand(ctx);
      break;
    case 'cashOut':
      cashOut(ctx);
      break;
    case 'buy':
      buy(ctx, a.offerId);
      break;
    case 'sellAtout':
      sellAtout(ctx, a.uid);
      break;
    case 'sellConsumable':
      sellConsumable(ctx, a.uid);
      break;
    case 'reroll':
      reroll(ctx);
      break;
    case 'shredCard':
      shred(ctx, a.cardId);
      break;
    case 'useConsumable':
      useConsumable(ctx, a.uid, a.targets ?? []);
      break;
    case 'reorderAtouts': {
      const byUid = new Map(ctx.s.atouts.map((x) => [x.uid, x]));
      ctx.s.atouts = a.order.map((u) => byUid.get(u)!);
      emit(ctx, { type: 'atoutsReordered', order: [...a.order] });
      settle(ctx);
      break;
    }
    case 'leaveShop':
      leaveShop(ctx);
      break;
    case 'skipTable':
      skipTable(ctx);
      break;
    case 'continueEndless':
      continueEndless(ctx);
      break;
  }
  if (shopRulesBefore && ctx.s.phase === 'shop') adjustShopAllowances(ctx, shopRulesBefore);
}

