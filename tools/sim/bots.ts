/**
 * Robots joueurs. Chaque robot renvoie UNE action à la fois ; le runner la passe au moteur.
 *  - naive : reste à 17, achète au hasard, ne se sert que des défausses pour se sauver.
 *  - basic : stratégie de base, achète tout ce qu'il peut, utilise ses objets simplement.
 *  - smart : stratégie informée, évalue chaque achat par des tables d'essai jouées dans le vrai
 *            moteur (mêmes graines pour chaque option), affine son sabot, ordonne ses atouts.
 */
import type { Action, AtoutDef, Card, ConsumableDef, RunState, ShopOffer } from '../../src/engine/types';
import type { AtoutFamily } from '../../src/content/index';
import type { SimEngine } from './engine';
import type { SimRng } from './prng';
import {
  basicInformedDecision,
  bestDiscard,
  discardAfterBustAllowed,
  naiveDecision,
  proactiveDiscard,
  smartDecision,
  type HandView,
  type PlayDecision,
} from './strategy';
import { evaluateOptions, handViewOf, type Evaluated, type ShopOption } from './rollout';

export type BotName = 'naive' | 'basic' | 'smart';

export interface BotOptions {
  /** N'achète rien (référence « sans atout »). */
  noBuy?: boolean;
  /** Achète tout sauf des atouts (mesure de la valeur marginale d'un atout donné au départ). */
  noAtoutBuy?: boolean;
  /** N'achète que des atouts de cette famille. */
  family?: AtoutFamily;
  /** Tables d'essai par option pour le robot malin. */
  rollouts?: number;
}

export interface BotCtx {
  engine: SimEngine;
  state: RunState;
  rng: SimRng;
  mem: BotMemory;
  options: BotOptions;
}

export interface BotMemory {
  /** Compteur de visites de boutique, pour réinitialiser l'état par visite. */
  shopKey: string;
  rerolls: number;
  evaluated: boolean;
  /** Ce que le robot a décidé de faire dans cette boutique (file d'actions). */
  plan: Action[];
  /** Achats décidés par le robot malin, par visite (pour ne pas réévaluer en boucle). */
  rounds: number;
  /** uid de l'atout le moins utile (calculé une fois par visite, emplacements pleins). */
  weakest: number | null;
}

export interface Bot {
  name: BotName;
  options: BotOptions;
  decide(ctx: BotCtx): Action;
}

export function newMemory(): BotMemory {
  return { shopKey: '', rerolls: 0, evaluated: false, plan: [], rounds: 0, weakest: null };
}

// ───────────────────────────── Lecture de l'état ─────────────────────────────

function handView(ctx: BotCtx): HandView | null {
  return handViewOf(ctx.engine, ctx.state);
}

function legal(ctx: BotCtx, a: Action): boolean {
  return ctx.engine.whyIllegal(ctx.state, a) === null;
}

function consumableDef(ctx: BotCtx, defId: string): ConsumableDef | undefined {
  return ctx.engine.consumableById.get(defId);
}

function atoutDef(ctx: BotCtx, defId: string): AtoutDef | undefined {
  return ctx.engine.atoutById.get(defId);
}

// ───────────────────────────── Consommables ─────────────────────────────

const RESCUE = ['rallonge', 'escamotage', 'echange', 'tour-de-manche'];

/** Cibles raisonnables pour une combine d'atelier (cartes du sabot). */
function workshopTargets(ctx: BotCtx, def: ConsumableDef, smart: boolean): number[] {
  const family = ctx.options.family;
  const deck = [...ctx.state.deck];
  const max = def.targeting?.max ?? 1;
  const val = (c: Card) => (c.rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.rank) ? 10 : Number(c.rank));
  const plain = deck.filter((c) => !c.enhancement);
  if (def.id === 'autodafe') {
    if (smart && family === 'petites') return [];
    return deck.sort((a, b) => val(a) - val(b)).slice(0, max).map((c) => c.id);
  }
  if (def.id === 'faussaire') {
    const best = deck.sort((a, b) => Number(!!b.enhancement) - Number(!!a.enhancement) || val(b) - val(a))[0];
    return best ? [best.id] : [];
  }
  if (def.id.startsWith('teinture-')) {
    // Teint les cartes qui ne sont pas déjà de l'enseigne visée.
    const suit = { 'teinture-coeur': 'hearts', 'teinture-carreau': 'diamonds', 'teinture-pique': 'spades', 'teinture-trefle': 'clubs' }[
      def.id
    ];
    return deck.filter((c) => c.suit !== suit).slice(0, max).map((c) => c.id);
  }
  if (def.id === 'voile' || def.id === 'ressort') {
    // Fantôme / élastique : sur les grosses cartes (moins de risque de crever).
    return plain.sort((a, b) => val(b) - val(a)).slice(0, max).map((c) => c.id);
  }
  const pool = smart ? plain : deck;
  return ctx.rng.shuffle([...pool]).slice(0, max).map((c) => c.id);
}

/** Faveurs et atelier, joués hors main. */
function useOffHandConsumable(ctx: BotCtx, smart: boolean): Action | null {
  for (const inst of ctx.state.consumables) {
    const def = consumableDef(ctx, inst.defId);
    if (!def || !def.usableIn.includes(ctx.state.phase)) continue;
    if (def.kind === 'faveur') {
      const a: Action = { type: 'useConsumable', uid: inst.uid, targets: [] };
      if (legal(ctx, a)) return a;
      continue;
    }
    if (def.targeting?.zone === 'deck') {
      const targets = workshopTargets(ctx, def, smart);
      if (targets.length < (def.targeting.min ?? 1)) continue;
      const a: Action = { type: 'useConsumable', uid: inst.uid, targets };
      if (legal(ctx, a)) return a;
    }
  }
  return null;
}

/** Combines tactiques pendant la main (hors sauvetage). */
function useTactical(ctx: BotCtx, v: HandView, decision: PlayDecision): Action | null {
  const limit = v.rules.playerLimit;
  for (const inst of ctx.state.consumables) {
    const def = consumableDef(ctx, inst.defId);
    if (!def || !def.usableIn.includes('playerTurn')) continue;
    const a: Action = { type: 'useConsumable', uid: inst.uid, targets: [] };
    if (def.id === 'filet' && decision === 'hit' && v.total >= limit - 9) {
      if (legal(ctx, a)) return a;
    }
    if (def.id === 'savonnette' && decision === 'stand' && v.total <= limit - 4) {
      if (legal(ctx, a)) return a;
    }
    if ((def.id === 'coup-d-oeil' || def.id === 'voyance' || def.id === 'lorgnette') && v.total >= limit - 9 && v.total <= limit - 5) {
      if (legal(ctx, a)) return a;
    }
  }
  return null;
}

/** En bustChoice sans défausse : essaie chaque combine de sauvetage sur une copie (le moteur est pur). */
function rescueWithConsumable(ctx: BotCtx): Action | null {
  const hand = ctx.state.table?.hand;
  if (!hand) return null;
  for (const inst of ctx.state.consumables) {
    if (!RESCUE.includes(inst.defId)) continue;
    const def = consumableDef(ctx, inst.defId);
    const candidates: number[][] = def?.targeting ? hand.playerCards.map((c) => [c.id]) : [[]];
    for (const targets of candidates) {
      const a: Action = { type: 'useConsumable', uid: inst.uid, targets };
      if (!legal(ctx, a)) continue;
      const after = ctx.engine.dispatch(ctx.state, a).state;
      if (after.phase === 'playerTurn') return a;
    }
  }
  return null;
}

// ───────────────────────────── Jeu de la main ─────────────────────────────

function playTurn(ctx: BotCtx, bot: BotName): Action {
  const v = handView(ctx)!;
  if (bot !== 'naive') {
    const pre = proactiveDiscard(ctx.engine, v);
    if (pre) {
      const a: Action = { type: 'discard', cardId: pre.id };
      if (legal(ctx, a)) return a;
    }
  }
  const decision =
    bot === 'naive' ? naiveDecision(v) : bot === 'basic' ? basicInformedDecision(ctx.engine, v) : smartDecision(ctx.engine, v);
  if (bot !== 'naive') {
    const t = useTactical(ctx, v, decision);
    if (t) return t;
  }
  if (decision === 'double' && legal(ctx, { type: 'double' })) return { type: 'double' };
  if (decision === 'hit' || decision === 'double') {
    if (legal(ctx, { type: 'hit' })) return { type: 'hit' };
  }
  return { type: 'stand' };
}

function bustChoice(ctx: BotCtx, bot: BotName): Action {
  const hand = ctx.state.table!.hand!;
  const rules = ctx.engine.getRules(ctx.state);
  const card = discardAfterBustAllowed(rules) ? bestDiscard(ctx.engine, hand.playerCards, rules.playerLimit) : null;
  if (card) {
    const a: Action = { type: 'discard', cardId: card.id };
    if (legal(ctx, a)) return a;
  }
  if (bot !== 'naive') {
    const r = rescueWithConsumable(ctx);
    if (r) return r;
  }
  return { type: 'acceptBust' };
}

// ───────────────────────────── Boutique ─────────────────────────────

function shopKey(s: RunState): string {
  return `${s.salon}:${s.tableIndex}:${s.stats.tablesWon}`;
}

function resetShopMemory(ctx: BotCtx): void {
  const key = shopKey(ctx.state);
  if (ctx.mem.shopKey !== key) {
    ctx.mem.shopKey = key;
    ctx.mem.rerolls = 0;
    ctx.mem.evaluated = false;
    ctx.mem.plan = [];
    ctx.mem.rounds = 0;
    ctx.mem.weakest = null;
  }
}

/** L'atout dont la revente coûte le moins de score (tables d'essai sans lui, mêmes graines). */
function weakestAtout(ctx: BotCtx, k: number): number | null {
  if (ctx.mem.weakest !== null && ctx.state.atouts.some((a) => a.uid === ctx.mem.weakest)) return ctx.mem.weakest;
  const options: ShopOption[] = ctx.state.atouts.map((a) => ({
    label: a.defId,
    actions: [{ type: 'sellAtout', uid: a.uid }],
    cost: 0,
  }));
  const out: Evaluated[] = [];
  evaluateOptions(ctx.engine, ctx.state, options, k, ctx.rng, out);
  const best = out.sort((x, y) => y.meanScore - x.meanScore)[0];
  const uid = best ? (best.option.actions[0] as { uid: number }).uid : null;
  ctx.mem.weakest = uid;
  return uid;
}

function affordable(ctx: BotCtx, o: ShopOffer): boolean {
  return !o.sold && ctx.state.money >= o.cost && legal(ctx, { type: 'buy', offerId: o.offerId });
}

function allowedAtout(opts: BotOptions, defId: string): boolean {
  if (!opts.family) return true;
  return familyMap()[defId] === opts.family;
}

let FAMILY_MAP: Record<string, AtoutFamily> | null = null;
export function setFamilyMap(m: Record<string, AtoutFamily>): void {
  FAMILY_MAP = m;
}
function familyMap(): Record<string, AtoutFamily> {
  return FAMILY_MAP ?? {};
}

function naiveShop(ctx: BotCtx, opts: BotOptions): Action {
  const off = useOffHandConsumable(ctx, false);
  if (off) return off;
  if (!opts.noBuy && !ctx.mem.evaluated) {
    ctx.mem.evaluated = true;
    const offers = ctx.rng.shuffle([...(ctx.state.shop?.offers ?? [])]);
    ctx.mem.plan = offers.filter(() => ctx.rng.chance(0.5)).map((o) => ({ type: 'buy', offerId: o.offerId }) as Action);
  }
  while (ctx.mem.plan.length) {
    const a = ctx.mem.plan.shift()!;
    if (a.type === 'buy') {
      const o = ctx.state.shop!.offers.find((x) => x.offerId === a.offerId);
      if (o && affordable(ctx, o) && (o.kind !== 'atout' || allowedAtout(opts, o.defId))) return a;
    }
  }
  return { type: 'leaveShop' };
}

const KIND_PRIORITY: Record<string, number> = { privilege: 0, atout: 1, faveur: 2, combine: 3, card: 4 };

function basicShop(ctx: BotCtx, opts: BotOptions): Action {
  const off = useOffHandConsumable(ctx, false);
  if (off) return off;
  if (opts.noBuy) return { type: 'leaveShop' };
  const offers = [...(ctx.state.shop?.offers ?? [])]
    .filter((o) => affordable(ctx, o))
    .filter((o) => o.kind !== 'atout' || (!opts.noAtoutBuy && allowedAtout(opts, o.defId)))
    .sort((a, b) => (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9));
  const o = offers[0];
  if (o) return { type: 'buy', offerId: o.offerId };
  // Plus rien à acheter : passer une petite carte à la Déchiqueteuse.
  const shop = ctx.state.shop;
  if (shop && shop.shredsLeft > 0 && ctx.state.money >= shop.shredCost) {
    const small = ctx.state.deck.find((c) => (c.rank === '2' || c.rank === '3') && !c.enhancement);
    if (small && legal(ctx, { type: 'shredCard', cardId: small.id })) return { type: 'shredCard', cardId: small.id };
  }
  return { type: 'leaveShop' };
}

/** Classe d'un atout pour l'ordre : règles et Jetons d'abord, +Mult ensuite, ×Mult à la fin. */
export function atoutOrderClass(def: AtoutDef | undefined): number {
  if (!def) return 1;
  const src = `${def.hooks.onHandScored ?? ''}${def.hooks.onCardScored ?? ''}`;
  if (/xMult/.test(src)) return 3;
  if (/mult:/.test(src)) return 2;
  return 1;
}

function reorderIfNeeded(ctx: BotCtx): Action | null {
  const atouts = ctx.state.atouts;
  if (atouts.length < 2) return null;
  const order = [...atouts]
    .map((a, i) => ({ a, i, k: atoutOrderClass(atoutDef(ctx, a.defId)) }))
    .sort((x, y) => x.k - y.k || x.i - y.i)
    .map((x) => x.a.uid);
  if (order.every((u, i) => u === atouts[i]!.uid)) return null;
  return { type: 'reorderAtouts', order };
}

/** Le robot malin : évalue les options par tables d'essai, puis affine. */
function smartShop(ctx: BotCtx, opts: BotOptions): Action {
  const off = useOffHandConsumable(ctx, true);
  if (off) return off;
  const reorder = reorderIfNeeded(ctx);
  if (reorder) return reorder;
  if (opts.noBuy) return { type: 'leaveShop' };
  if (ctx.mem.plan.length) {
    const a = ctx.mem.plan.shift()!;
    if (legal(ctx, a)) return a;
    ctx.mem.plan = [];
  }
  const shop = ctx.state.shop!;
  if (ctx.mem.rounds < 2) {
    ctx.mem.rounds++;
    const options: ShopOption[] = [{ label: 'rien', actions: [], cost: 0 }];
    const rules = ctx.engine.getRules(ctx.state);
    for (const o of shop.offers) {
      if (o.sold || o.cost > ctx.state.money) continue;
      if (o.kind === 'atout') {
        if (!allowedAtout(opts, o.defId)) continue;
        if (ctx.state.atouts.length < rules.atoutSlots) {
          options.push({ label: o.defId, actions: [{ type: 'buy', offerId: o.offerId }], cost: o.cost });
        } else {
          // Emplacements pleins : on ne propose que de remplacer l'atout le moins utile.
          const weak = weakestAtout(ctx, opts.rollouts ?? 6);
          if (weak !== null) {
            const back = ctx.engine.sellValue(ctx.state, weak);
            options.push({
              label: `${o.defId} à la place de ${weak}`,
              actions: [{ type: 'sellAtout', uid: weak }, { type: 'buy', offerId: o.offerId }],
              cost: o.cost - back,
            });
          }
        }
      } else if (o.kind === 'privilege') {
        options.push({ label: o.defId, actions: [{ type: 'buy', offerId: o.offerId }], cost: o.cost });
      } else if (o.kind === 'faveur' && ctx.state.consumables.length < rules.consumableSlots) {
        // Une faveur se joue tout de suite : achat + usage.
        options.push({ label: o.defId, actions: [{ type: 'buy', offerId: o.offerId }], cost: o.cost, useBought: true });
      }
    }
    if (options.length > 1) {
      const best = evaluateOptions(ctx.engine, ctx.state, options, opts.rollouts ?? 6, ctx.rng);
      if (best && best.actions.length) {
        ctx.mem.plan = [...best.actions];
        const a = ctx.mem.plan.shift()!;
        if (legal(ctx, a)) return a;
      }
    }
  }
  // Combines d'atelier utiles et bon marché, si une place est libre.
  const rules = ctx.engine.getRules(ctx.state);
  if (ctx.state.consumables.length < rules.consumableSlots) {
    const want = ['plomb', 'braise', 'cristal', 'autodafe', 'faussaire'];
    const o = shop.offers.find((x) => x.kind === 'combine' && want.includes(x.defId) && affordable(ctx, x));
    if (o && ctx.state.money - o.cost >= 4) return { type: 'buy', offerId: o.offerId };
  }
  // Affiner le sabot : retirer les plus petites cartes (sauf build petites cartes).
  if (opts.family !== 'petites' && shop.shredsLeft > 0 && ctx.state.money - shop.shredCost >= 6) {
    const small = ctx.state.deck.filter((c) => ['2', '3', '4'].includes(c.rank) && !c.enhancement);
    const target = small[0];
    if (target && legal(ctx, { type: 'shredCard', cardId: target.id })) return { type: 'shredCard', cardId: target.id };
  }
  // Relancer quand on est riche (au-delà de l'intérêt maximal).
  const cap = (rules.interestCap + 1) * 5;
  if (ctx.mem.rerolls < 2 && ctx.state.money - shop.rerollCost >= cap) {
    ctx.mem.rerolls++;
    ctx.mem.rounds = 0;
    return { type: 'reroll' };
  }
  return { type: 'leaveShop' };
}

// ───────────────────────────── Robots ─────────────────────────────

export function makeBot(name: BotName, options: BotOptions = {}): Bot {
  return {
    name,
    options,
    decide(ctx: BotCtx): Action {
      const s = ctx.state;
      switch (s.phase) {
        case 'tableIntro': {
          const off = name === 'naive' ? null : useOffHandConsumable(ctx, name === 'smart');
          return off ?? { type: 'startTable' };
        }
        case 'playerTurn':
          return playTurn(ctx, name);
        case 'bustChoice':
          return bustChoice(ctx, name);
        case 'handResult': {
          const off = name === 'naive' ? null : useOffHandConsumable(ctx, name === 'smart');
          return off ?? { type: 'nextHand' };
        }
        case 'tableWon':
          return { type: 'cashOut' };
        case 'shop':
          resetShopMemory(ctx);
          return name === 'naive' ? naiveShop(ctx, options) : name === 'basic' ? basicShop(ctx, options) : smartShop(ctx, options);
        default:
          throw new Error(`phase sans décision : ${s.phase}`);
      }
    },
  };
}
