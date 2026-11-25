/**
 * Boutique.
 *  - rules.shopOffers offres tirées au hasard : type pondéré par balance.offerKindWeights, atout pondéré
 *    par rareté (jamais un atout déjà possédé ni deux fois le même), combine/faveur uniformes sans
 *    doublon dans la même boutique, carte à jouer = rang et enseigne au hasard avec une amélioration.
 *  - Le privilège du salon (tiré au début du salon) est proposé dans chaque boutique du salon jusqu'à
 *    son achat : un seul privilège par salon.
 *  - Relance : régénère les offres hors privilège. Les relances gratuites (rules.freeRerollsPerShop)
 *    passent d'abord et ne font pas monter le prix.
 *  - Déchiqueteuse : rules.shredsPerShop fois par boutique ; son prix monte sur toute la partie.
 *  - Revente : floor(prix × sellRatio), minimum 1 $.
 */
import { ENHANCEMENT_IDS, RANKS, SUITS } from './cards';
import { DEFAULT_CARD_OFFER_COST } from './checks';
import {
  addAtout,
  addConsumable,
  changeMoney,
  type Ctx,
  destroyCard,
  emit,
  hookContext,
  markSeen,
  removeAtout,
  rulesOf,
  runSimpleHook,
} from './core';
import type { Registry } from './registry';
import { weightedPick } from './rng';
import { createTableIntro } from './table';
import type { Card, EnhancementId, OfferKind, Rules, RunState, ShopOffer } from './types';

type RolledKind = Exclude<OfferKind, 'privilege'>;
const ROLLED_KINDS: readonly RolledKind[] = ['atout', 'combine', 'faveur', 'card'];

export function sellValueOf(reg: Registry, s: Readonly<RunState>, uid: number): number {
  const ratio = reg.content.balance.sellRatio;
  const atout = s.atouts.find((a) => a.uid === uid);
  if (atout) {
    const def = reg.atouts.get(atout.defId);
    return def ? Math.max(1, Math.floor(def.cost * ratio)) : 1;
  }
  const cons = s.consumables.find((c) => c.uid === uid);
  if (cons) {
    const def = reg.consumables.get(cons.defId);
    return def ? Math.max(1, Math.floor(def.cost * ratio)) : 1;
  }
  return 0;
}

/** Prix affiché d'une offre : prix de base + rules.shopPriceAdd (jamais sous 0). */
function price(ctx: Ctx, base: number): number {
  return Math.max(0, base + (rulesOf(ctx).shopPriceAdd ?? 0));
}

function rollOffer(ctx: Ctx, existing: readonly ShopOffer[]): ShopOffer | null {
  const { content } = ctx.reg;
  const b = content.balance;
  const s = ctx.s;
  const owned = new Set(s.atouts.map((a) => a.defId));
  const offered = new Set(existing.map((o) => o.defId));
  const appears = (d: { canAppear?(state: Readonly<RunState>): boolean }): boolean => !d.canAppear || d.canAppear(s);
  const atoutPool = content.atouts.filter(
    (a) => !owned.has(a.id) && !offered.has(a.id) && (b.rarityWeights[a.rarity] ?? 0) > 0 && appears(a),
  );
  const combinePool = content.consumables.filter((c) => c.kind === 'combine' && !offered.has(c.id) && appears(c));
  const faveurPool = content.consumables.filter((c) => c.kind === 'faveur' && !offered.has(c.id) && appears(c));
  const available = (k: RolledKind): boolean =>
    k === 'card' ? true : k === 'atout' ? atoutPool.length > 0 : k === 'combine' ? combinePool.length > 0 : faveurPool.length > 0;
  const kind = weightedPick(
    ctx.rng,
    ROLLED_KINDS.filter((k) => available(k)),
    (k) => b.offerKindWeights[k] ?? 0,
  );
  if (!kind) return null;

  if (kind === 'atout') {
    const def = weightedPick(ctx.rng, atoutPool, (a) => b.rarityWeights[a.rarity] ?? 0);
    if (!def) return null;
    return { offerId: s.nextUid++, kind, defId: def.id, cost: price(ctx, def.cost), sold: false };
  }
  if (kind === 'combine' || kind === 'faveur') {
    const def = ctx.rng.pick(kind === 'combine' ? combinePool : faveurPool);
    return { offerId: s.nextUid++, kind, defId: def.id, cost: price(ctx, def.cost), sold: false };
  }
  const enhancements = (Object.keys(content.enhancements) as EnhancementId[]).filter((e) => ENHANCEMENT_IDS.includes(e));
  const card: Card = {
    id: s.nextCardId++,
    rank: ctx.rng.pick(RANKS),
    suit: ctx.rng.pick(SUITS),
    enhancement: ctx.rng.pick(enhancements.length ? enhancements : ENHANCEMENT_IDS),
  };
  return { offerId: s.nextUid++, kind: 'card', defId: '', card, cost: price(ctx, b.cardOfferCost ?? DEFAULT_CARD_OFFER_COST), sold: false };
}

function rollOffers(ctx: Ctx, count: number): ShopOffer[] {
  const offers: ShopOffer[] = [];
  for (let i = 0; i < count; i++) {
    const o = rollOffer(ctx, offers);
    if (!o) continue;
    offers.push(o);
    if (o.kind === 'atout') markSeen(ctx.s, 'atouts', o.defId);
    else if (o.kind === 'combine' || o.kind === 'faveur') markSeen(ctx.s, 'consumables', o.defId);
  }
  return offers;
}

/** Prix affichés (relance, Déchiqueteuse), recalculés après chaque action. */
export function syncShop(ctx: Ctx): void {
  const shop = ctx.s.shop;
  if (!shop) return;
  const b = ctx.reg.content.balance;
  const r = rulesOf(ctx);
  shop.rerollCost =
    (shop.freeRerollsLeft ?? 0) > 0
      ? 0
      : Math.max(0, b.rerollBaseCost + b.rerollCostStep * (shop.rerollsPaid ?? 0) - r.rerollDiscount + (r.shopPriceAdd ?? 0));
  shop.shredCost = Math.max(0, b.shredBaseCost + b.shredCostStep * (ctx.s.stats.cardsShredded ?? 0) + (r.shopPriceAdd ?? 0));
}

/**
 * Un achat ou une vente en boutique peut changer le nombre de relances gratuites ou d'usages de la
 * Déchiqueteuse : on reporte la différence sur la boutique en cours.
 */
export function adjustShopAllowances(ctx: Ctx, before: Rules): void {
  const shop = ctx.s.shop;
  if (!shop) return;
  const after = rulesOf(ctx);
  shop.shredsLeft = Math.max(0, shop.shredsLeft + after.shredsPerShop - before.shredsPerShop);
  shop.freeRerollsLeft = Math.max(0, (shop.freeRerollsLeft ?? 0) + after.freeRerollsPerShop - before.freeRerollsPerShop);
}

export function enterShop(ctx: Ctx): void {
  const s = ctx.s;
  const r = rulesOf(ctx);
  const offers = rollOffers(ctx, r.shopOffers);
  const privDef = s.salonPrivilege ? ctx.reg.privileges.get(s.salonPrivilege) : undefined;
  if (privDef) offers.push({ offerId: s.nextUid++, kind: 'privilege', defId: privDef.id, cost: price(ctx, privDef.cost), sold: false });
  s.shop = {
    offers,
    rerollCost: 0,
    shredCost: 0,
    shredsLeft: r.shredsPerShop,
    freeRerollsLeft: r.freeRerollsPerShop,
    rerollsPaid: 0,
  };
  s.phase = 'shop';
  syncShop(ctx);
  emit(ctx, { type: 'shopEntered' });
  runSimpleHook(ctx, 'onShopEnter');
}

export function buy(ctx: Ctx, offerId: number): void {
  const s = ctx.s;
  const offer = s.shop!.offers.find((o) => o.offerId === offerId)!;
  const name = offerName(ctx.reg, offer);
  offer.sold = true;
  emit(ctx, { type: 'offerBought', offerId });
  changeMoney(ctx, -offer.cost, `Achat : ${name}`);
  switch (offer.kind) {
    case 'atout':
      addAtout(ctx, offer.defId, true);
      break;
    case 'combine':
    case 'faveur':
      addConsumable(ctx, offer.defId, true);
      break;
    case 'card': {
      const card = { ...offer.card! };
      s.deck.push(card);
      emit(ctx, { type: 'cardAddedToDeck', card: { ...card } });
      break;
    }
    case 'privilege': {
      const def = ctx.reg.privileges.get(offer.defId)!;
      s.privileges.push(def.id);
      for (const m of def.mods ?? []) s.runMods.push({ ...m });
      if (s.salonPrivilege === def.id) s.salonPrivilege = null;
      emit(ctx, { type: 'privilegeGained', defId: def.id });
      if (def.onBuy) {
        const onBuy = def.onBuy;
        try {
          onBuy.call(def, hookContext(ctx, null));
          ctx.seq++;
        } catch (e) {
          throw new Error(`Privilège « ${def.name} », onBuy : ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        }
      }
      break;
    }
  }
}

export function offerName(reg: Registry, offer: ShopOffer): string {
  if (offer.kind === 'atout') return reg.atouts.get(offer.defId)?.name ?? offer.defId;
  if (offer.kind === 'privilege') return reg.privileges.get(offer.defId)?.name ?? offer.defId;
  if (offer.kind === 'card') return 'carte';
  return reg.consumables.get(offer.defId)?.name ?? offer.defId;
}

export function sellAtout(ctx: Ctx, uid: number): void {
  const value = sellValueOf(ctx.reg, ctx.s, uid);
  const inst = removeAtout(ctx, uid);
  if (inst) changeMoney(ctx, value, `Revente : ${ctx.reg.atouts.get(inst.defId)?.name ?? inst.defId}`);
}

export function sellConsumable(ctx: Ctx, uid: number): void {
  const s = ctx.s;
  const value = sellValueOf(ctx.reg, s, uid);
  const idx = s.consumables.findIndex((c) => c.uid === uid);
  if (idx < 0) return;
  const [inst] = s.consumables.splice(idx, 1);
  emit(ctx, { type: 'consumableRemoved', uid, defId: inst.defId });
  changeMoney(ctx, value, `Revente : ${ctx.reg.consumables.get(inst.defId)?.name ?? inst.defId}`);
}

export function reroll(ctx: Ctx): void {
  const shop = ctx.s.shop!;
  if ((shop.freeRerollsLeft ?? 0) > 0) {
    shop.freeRerollsLeft = (shop.freeRerollsLeft ?? 0) - 1;
  } else {
    changeMoney(ctx, -shop.rerollCost, 'Relance');
    shop.rerollsPaid = (shop.rerollsPaid ?? 0) + 1;
  }
  const kept = shop.offers.filter((o) => o.kind === 'privilege');
  shop.offers = [...rollOffers(ctx, rulesOf(ctx).shopOffers), ...kept];
  emit(ctx, { type: 'shopRerolled' });
  syncShop(ctx);
}

export function shred(ctx: Ctx, cardId: number): void {
  const s = ctx.s;
  const shop = s.shop!;
  changeMoney(ctx, -shop.shredCost, 'Déchiqueteuse');
  destroyCard(ctx, cardId, 'Déchiqueteuse');
  shop.shredsLeft = Math.max(0, shop.shredsLeft - 1);
  s.stats.cardsShredded = (s.stats.cardsShredded ?? 0) + 1;
  syncShop(ctx);
}

export function leaveShop(ctx: Ctx): void {
  ctx.s.shop = null;
  createTableIntro(ctx);
}

