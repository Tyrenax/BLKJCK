/**
 * Noyau mutable du moteur : contexte de dispatch, crochets, opérations sur les cartes et l'argent,
 * et l'implémentation de MutationApi. Tout ici agit sur un BROUILLON (copie profonde du state reçu),
 * jamais sur le state de l'appelant.
 */
import { copyCard, handValue } from './cards';
import type { Registry } from './registry';
import { createRng } from './rng';
import { computeRules } from './rules';
import type {
  AtoutDef,
  AtoutInstance,
  BossDef,
  Card,
  ConsumableInstance,
  EnhancementId,
  FigureId,
  GameEvent,
  HandState,
  HookContext,
  Hooks,
  MutationApi,
  Rank,
  Rng,
  RuleMod,
  Rules,
  RunState,
  ScoreSource,
  SeenRecord,
  StakeDef,
  Suit,
  TableState,
} from './types';

// ───────────────────────────── Contexte ─────────────────────────────

export interface Ctx {
  reg: Registry;
  /** Brouillon muté par l'action en cours. */
  s: RunState;
  events: GameEvent[];
  rng: Rng;
  /** Profondeur d'imbrication des crochets (garde-fou contre les boucles infinies du contenu). */
  depth: number;
  /** Compteur de mutations hors événements (fin de crochet, setFlag…), clé du cache de règles. */
  seq: number;
  /** Événements émis (comptés même en mode silencieux : c'est une clé du cache de règles). */
  evCount: number;
  /** Mode silencieux : les événements ne sont pas conservés (simulateur). Même comportement. */
  silent: boolean;
  rulesCache: { key: unknown[]; rules: Rules } | null;
}

export const MAX_HOOK_DEPTH = 4;

export function makeCtx(reg: Registry, s: RunState, silent = false): Ctx {
  return { reg, s, events: [], rng: createRng(s), depth: 0, seq: 0, evCount: 0, silent, rulesCache: null };
}

export function emit(ctx: Ctx, e: GameEvent): void {
  ctx.evCount++;
  if (!ctx.silent) ctx.events.push(e);
}

/**
 * Règles effectives pendant un dispatch, mises en cache. Le cache est invalidé dès que l'une de ses
 * entrées bouge : un événement émis (toute mutation passe par là), la fin d'un crochet ou un setFlag
 * (ctx.seq), un changement de phase, de table, de main, de mods, d'atouts, d'argent… L'objet renvoyé
 * est gelé : personne ne doit le muter (HookContext.rules est en lecture seule).
 */
export function rulesOf(ctx: Ctx): Rules {
  const s = ctx.s;
  const t = s.table;
  const h = t?.hand;
  const key: unknown[] = [
    ctx.evCount,
    ctx.seq,
    s.phase,
    t,
    h,
    s.runMods.length,
    t?.mods.length,
    h?.mods.length,
    s.atouts,
    s.atouts.length,
    s.money,
    s.deck.length,
    s.privileges.length,
    s.shop,
    h?.hits,
    h?.doubled,
    h?.playerCards.length,
    t?.discardsUsed,
    t?.handsDealt,
  ];
  const c = ctx.rulesCache;
  if (c && c.key.every((v, i) => v === key[i])) return c.rules;
  const rules = Object.freeze(computeRules(ctx.reg, s)) as Rules;
  ctx.rulesCache = { key, rules };
  return rules;
}

/** Erreur levée par un crochet du contenu, enrichie du nom de l'objet fautif. */
export class HookError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'HookError';
  }
}

// ───────────────────────────── Porteurs de crochets ─────────────────────────────

export type Holder = (
  | { kind: 'stake'; def: StakeDef }
  | { kind: 'boss'; def: BossDef }
  | { kind: 'atout'; inst: AtoutInstance; def: AtoutDef }
) & { hooks: Hooks };

const NO_HOOKS: Hooks = {};

/** Mises actives (cumulatives : toutes celles de rang ≤ stakeLevel). */
export function activeStakes(reg: Registry, s: Readonly<RunState>): StakeDef[] {
  const level = s.stakeLevel;
  if (level === undefined || level < 0) return [];
  return (reg.content.stakes ?? []).slice(0, level + 1);
}

/** Mises (toute la partie), puis patron (seulement à sa table), puis atouts de gauche à droite. */
export function holders(reg: Registry, s: Readonly<RunState>): Holder[] {
  const out: Holder[] = [];
  for (const def of activeStakes(reg, s)) if (def.hooks) out.push({ kind: 'stake', def, hooks: def.hooks ?? NO_HOOKS });
  const bossId = s.table?.bossId;
  const boss = bossId ? reg.bosses.get(bossId) : undefined;
  if (boss) out.push({ kind: 'boss', def: boss, hooks: boss.hooks });
  for (const inst of s.atouts) {
    const def = reg.atouts.get(inst.defId);
    if (def) out.push({ kind: 'atout', inst, def, hooks: def.hooks });
  }
  return out;
}

export function holderName(h: Holder): string {
  if (h.kind === 'stake') return `Mise « ${h.def.name} »`;
  return h.kind === 'boss' ? `Patron « ${h.def.name} »` : `Atout « ${h.def.name} »`;
}

export function holderSource(h: Holder, cardId?: number): ScoreSource {
  if (h.kind === 'stake') return { kind: 'stake', stakeId: h.def.id };
  if (h.kind === 'boss') return { kind: 'boss', bossId: h.def.id };
  return cardId === undefined ? { kind: 'atout', uid: h.inst.uid } : { kind: 'atout', uid: h.inst.uid, cardId };
}

/** Appelle `fn` pour chaque porteur encore présent (un atout vendu en cours de route est sauté). */
export function eachHolder(ctx: Ctx, fn: (h: Holder, hooks: Hooks) => void): void {
  if (ctx.depth >= MAX_HOOK_DEPTH) return;
  for (const h of holders(ctx.reg, ctx.s)) {
    if (h.kind === 'atout' && !ctx.s.atouts.includes(h.inst)) continue;
    fn(h, h.hooks);
  }
}

/** Exécute un crochet : garde-fou de profondeur, erreur contextualisée, détection de atoutChanged. */
export function callHook<T>(ctx: Ctx, h: Holder, hookName: string, fn: () => T): T {
  const before = h.kind === 'atout' ? JSON.stringify(h.inst.state) : '';
  ctx.depth++;
  let ok = false;
  try {
    const r = fn();
    ok = true;
    return r;
  } catch (e) {
    if (e instanceof HookError) throw e;
    throw new HookError(`${holderName(h)}, crochet ${hookName} : ${e instanceof Error ? e.message : String(e)}`, e);
  } finally {
    ctx.depth--;
    ctx.seq++;
    if (ok && h.kind === 'atout' && ctx.s.atouts.includes(h.inst) && JSON.stringify(h.inst.state) !== before) {
      emit(ctx, { type: 'atoutChanged', uid: h.inst.uid });
    }
  }
}

/** Contexte d'un crochet. `api` est construite à la première lecture (la plupart des crochets s'en passent). */
export function hookContext(ctx: Ctx, h: Holder | null): HookContext {
  let api: MutationApi | null = null;
  return {
    state: ctx.s,
    rules: rulesOf(ctx),
    rng: ctx.rng,
    self: h?.kind === 'atout' ? h.inst : null,
    get api(): MutationApi {
      return (api ??= makeApi(ctx, h));
    },
  };
}

type SimpleHook = 'onTableStart' | 'onHandStart' | 'onTableEnd' | 'onShopEnter';

export function runSimpleHook(ctx: Ctx, name: SimpleHook): void {
  eachHolder(ctx, (h, hooks) => {
    const fn = hooks[name];
    if (fn) callHook(ctx, h, name, () => fn.call(hooks, hookContext(ctx, h)));
  });
}

// ───────────────────────────── Zones de cartes ─────────────────────────────

/** La table est lancée (sabots mélangés) : toute carte du deck est dans une zone de la table. */
export function tableInPlay(s: Readonly<RunState>): boolean {
  return !!s.table && s.phase !== 'tableIntro';
}

export function dealerDiscard(t: TableState): Card[] {
  if (!t.dealerDiscardPile) t.dealerDiscardPile = [];
  return t.dealerDiscardPile;
}

export function isPlayerOwned(s: Readonly<RunState>, id: number): boolean {
  return s.deck.some((c) => c.id === id);
}

export function visiblePlayerCards(hand: Readonly<HandState>): Card[] {
  const hidden = hand.hiddenCardIds;
  return hidden && hidden.length ? hand.playerCards.filter((c) => !hidden.includes(c.id)) : [...hand.playerCards];
}

export function visibleDealerCards(hand: Readonly<HandState>): Card[] {
  return hand.holeRevealed ? [...hand.dealerCards] : hand.dealerCards.filter((_, i) => i !== 1);
}

/** Toutes les listes où une carte peut se trouver (deck, sabots, défausses, mains). */
function cardLists(s: RunState): Card[][] {
  const lists: Card[][] = [s.deck];
  const t = s.table;
  if (t) {
    lists.push(t.drawPile, t.discardPile, t.dealerDrawPile);
    if (t.dealerDiscardPile) lists.push(t.dealerDiscardPile);
    if (t.hand) lists.push(t.hand.playerCards, t.hand.dealerCards);
  }
  return lists;
}

export function findCard(s: RunState, id: number): Card | undefined {
  for (const list of cardLists(s)) {
    const c = list.find((x) => x.id === id);
    if (c) return c;
  }
  for (const o of s.shop?.offers ?? []) if (o.card?.id === id) return o.card;
  return undefined;
}

/** Applique `fn` à toutes les copies d'une carte (deck + zones de table + offre de boutique). */
function forEachCopy(s: RunState, id: number, fn: (c: Card) => void): void {
  for (const list of cardLists(s)) for (const c of list) if (c.id === id) fn(c);
  for (const o of s.shop?.offers ?? []) if (o.card?.id === id) fn(o.card);
}

function removeEverywhere(s: RunState, id: number): void {
  for (const list of cardLists(s)) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].id === id) list.splice(i, 1);
  }
  const hand = s.table?.hand;
  if (hand?.hiddenCardIds) hand.hiddenCardIds = hand.hiddenCardIds.filter((x) => x !== id);
}

// ───────────────────────────── Pioche ─────────────────────────────

/**
 * Prend la carte du sommet d'un sabot. Si le sabot est vide et `reshuffle`, la défausse est
 * remélangée dedans (cas limite d'un deck très affiné — sinon les cartes sorties ne reviennent pas).
 */
export function takeTop(ctx: Ctx, owner: 'player' | 'dealer', reshuffle = true): Card | null {
  const t = ctx.s.table;
  if (!t) return null;
  const pile = owner === 'player' ? t.drawPile : t.dealerDrawPile;
  if (pile.length === 0) {
    if (!reshuffle) return null;
    const disc = owner === 'player' ? t.discardPile : dealerDiscard(t);
    if (disc.length === 0) return null;
    pile.push(...disc.splice(0));
    ctx.rng.shuffle(pile);
    emit(ctx, { type: 'deckReshuffled', owner, count: pile.length });
  }
  return pile.shift() ?? null;
}

/** Vrai si une carte peut encore être tirée par le joueur (sabot ou défausse à remélanger). */
export function playerCanDraw(s: Readonly<RunState>): boolean {
  const t = s.table;
  return !!t && (t.drawPile.length > 0 || t.discardPile.length > 0);
}

function runCardDrawn(ctx: Ctx, card: Card, who: 'player' | 'dealer'): void {
  eachHolder(ctx, (h, hooks) => {
    const fn = hooks.onCardDrawn;
    if (!fn) return;
    const current = findCard(ctx.s, card.id) ?? card;
    callHook(ctx, h, 'onCardDrawn', () => fn.call(hooks, hookContext(ctx, h), copyCard(current), who));
  });
}

export function dealToPlayer(ctx: Ctx, hidden = false): Card | null {
  const hand = ctx.s.table?.hand;
  if (!hand) return null;
  const card = takeTop(ctx, 'player');
  if (!card) return null;
  hand.playerCards.push(card);
  if (hidden) (hand.hiddenCardIds ??= []).push(card.id);
  const v = handValue(visiblePlayerCards(hand), rulesOf(ctx).playerLimit);
  emit(ctx, { type: 'cardDealt', to: 'player', card: copyCard(card), faceDown: hidden, total: v.total, soft: v.soft });
  runCardDrawn(ctx, card, 'player');
  return card;
}

export function dealToDealer(ctx: Ctx, faceDown = false): Card | null {
  const hand = ctx.s.table?.hand;
  if (!hand) return null;
  const card = takeTop(ctx, 'dealer');
  if (!card) return null;
  hand.dealerCards.push(card);
  const v = handValue(visibleDealerCards(hand), rulesOf(ctx).dealerLimit);
  emit(ctx, { type: 'cardDealt', to: 'dealer', card: copyCard(card), faceDown, total: v.total, soft: v.soft });
  runCardDrawn(ctx, card, 'dealer');
  return card;
}

/** Retire une carte de la main du joueur vers la défausse de son propriétaire. */
export function discardFromHand(ctx: Ctx, cardId: number): Card | null {
  const t = ctx.s.table;
  const hand = t?.hand;
  if (!t || !hand) return null;
  const idx = hand.playerCards.findIndex((c) => c.id === cardId);
  if (idx < 0) return null;
  const [card] = hand.playerCards.splice(idx, 1);
  if (hand.hiddenCardIds) hand.hiddenCardIds = hand.hiddenCardIds.filter((x) => x !== cardId);
  (isPlayerOwned(ctx.s, cardId) ? t.discardPile : dealerDiscard(t)).push(card);
  const v = handValue(visiblePlayerCards(hand), rulesOf(ctx).playerLimit);
  emit(ctx, { type: 'cardDiscarded', owner: 'player', card: copyCard(card), total: v.total });
  return card;
}

export function revealHole(ctx: Ctx): void {
  const hand = ctx.s.table?.hand;
  if (!hand || hand.holeRevealed) return;
  hand.holeRevealed = true;
  const hole = hand.dealerCards[1];
  if (hole) {
    const v = handValue(hand.dealerCards, rulesOf(ctx).dealerLimit);
    emit(ctx, { type: 'holeRevealed', card: copyCard(hole), total: v.total });
  }
}

/** Retourne les cartes du joueur distribuées face cachée. */
export function revealPlayerCards(ctx: Ctx): void {
  const hand = ctx.s.table?.hand;
  if (!hand?.hiddenCardIds?.length) return;
  const ids = hand.hiddenCardIds;
  delete hand.hiddenCardIds;
  const v = handValue(hand.playerCards, rulesOf(ctx).playerLimit);
  for (const id of ids) {
    const c = hand.playerCards.find((x) => x.id === id);
    if (c) emit(ctx, { type: 'playerCardRevealed', card: copyCard(c), total: v.total });
  }
}

// ───────────────────────────── Argent, cartes, objets ─────────────────────────────

/** Change l'argent (jamais sous 0, toujours entier). Renvoie la variation réelle. */
export function changeMoney(ctx: Ctx, delta: number, reason: string, silent = false): number {
  const before = ctx.s.money;
  const after = Math.max(0, Math.round(before + (Number.isFinite(delta) ? delta : 0)));
  ctx.s.money = after;
  const d = after - before;
  if (d !== 0 && !silent) emit(ctx, { type: 'moneyChanged', delta: d, total: after, reason });
  return d;
}

export function modifyCard(ctx: Ctx, id: number, mutate: (c: Card) => void): void {
  const first = findCard(ctx.s, id);
  if (!first) return;
  const before = copyCard(first);
  forEachCopy(ctx.s, id, mutate);
  const after = copyCard(findCard(ctx.s, id) ?? first);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  emit(ctx, { type: 'cardChanged', before, after });
  // Une carte face cachée (Le Borgne) transformée sous les yeux du joueur n'a plus de secret.
  const hand = ctx.s.table?.hand;
  if (hand?.hiddenCardIds?.includes(id)) {
    hand.hiddenCardIds = hand.hiddenCardIds.filter((x) => x !== id);
    if (hand.hiddenCardIds.length === 0) delete hand.hiddenCardIds;
    const v = handValue(hand.playerCards, rulesOf(ctx).playerLimit);
    emit(ctx, { type: 'playerCardRevealed', card: after, total: v.total });
  }
}

export function destroyCard(ctx: Ctx, id: number, reason: string): void {
  const card = findCard(ctx.s, id);
  if (!card) return;
  const snapshot = copyCard(card);
  removeEverywhere(ctx.s, id);
  emit(ctx, { type: 'cardDestroyed', card: snapshot, reason });
}

function cleanCard(spec: Omit<Card, 'id'>, id: number): Card {
  const c: Card = { id, rank: spec.rank, suit: spec.suit };
  if (spec.enhancement) c.enhancement = spec.enhancement;
  return c;
}

/**
 * Ajoute une carte au deck. Si une table est en cours, elle rejoint aussi la table : mélangée dans
 * le sabot si `toDrawPile`, sinon posée dans la défausse (jouable à la table suivante).
 */
export function addCardToDeck(ctx: Ctx, spec: Omit<Card, 'id'>, toDrawPile = false): Card {
  const card = cleanCard(spec, ctx.s.nextCardId++);
  ctx.s.deck.push(card);
  const t = ctx.s.table;
  if (t && tableInPlay(ctx.s)) {
    if (toDrawPile) t.drawPile.splice(ctx.rng.int(0, t.drawPile.length), 0, copyCard(card));
    else t.discardPile.push(copyCard(card));
  }
  emit(ctx, { type: 'cardAddedToDeck', card: copyCard(card) });
  return copyCard(card);
}

/** Retient qu'un objet a été rencontré pendant la partie (collection du profil). */
export function markSeen(s: RunState, kind: keyof SeenRecord, id: string): void {
  const seen = (s.seen ??= { atouts: [], consumables: [], privileges: [] });
  if (!seen[kind].includes(id)) seen[kind].push(id);
}

export function newAtoutInstance(ctx: Ctx, def: AtoutDef): AtoutInstance {
  return { uid: ctx.s.nextUid++, defId: def.id, state: def.initialState ? { ...def.initialState() } : {} };
}

export function addAtout(ctx: Ctx, defId: string, ignoreSlots = false): AtoutInstance | null {
  const def = ctx.reg.atouts.get(defId);
  if (!def) return null;
  if (!ignoreSlots && ctx.s.atouts.length >= rulesOf(ctx).atoutSlots) return null;
  const inst = newAtoutInstance(ctx, def);
  ctx.s.atouts.push(inst);
  markSeen(ctx.s, 'atouts', defId);
  emit(ctx, { type: 'atoutAdded', uid: inst.uid, defId });
  return inst;
}

export function removeAtout(ctx: Ctx, uid: number): AtoutInstance | null {
  const idx = ctx.s.atouts.findIndex((a) => a.uid === uid);
  if (idx < 0) return null;
  const [inst] = ctx.s.atouts.splice(idx, 1);
  emit(ctx, { type: 'atoutRemoved', uid, defId: inst.defId });
  return inst;
}

export function addConsumable(ctx: Ctx, defId: string, ignoreSlots = false): ConsumableInstance | null {
  if (!ctx.reg.consumables.has(defId)) return null;
  if (!ignoreSlots && ctx.s.consumables.length >= rulesOf(ctx).consumableSlots) return null;
  const inst: ConsumableInstance = { uid: ctx.s.nextUid++, defId };
  ctx.s.consumables.push(inst);
  markSeen(ctx.s, 'consumables', defId);
  emit(ctx, { type: 'consumableAdded', uid: inst.uid, defId });
  return inst;
}

function flagBag(ctx: Ctx, scope: 'hand' | 'table' | 'run'): Record<string, number> | null {
  if (scope === 'run') return ctx.s.flags;
  if (scope === 'table') return ctx.s.table?.flags ?? null;
  return ctx.s.table?.hand?.flags ?? null;
}

function addRuleMod(ctx: Ctx, scope: 'hand' | 'table' | 'run', mod: RuleMod): void {
  const copy = { ...mod } as RuleMod;
  if (scope === 'run') ctx.s.runMods.push(copy);
  else if (scope === 'table') {
    if (!ctx.s.table) return;
    ctx.s.table.mods.push(copy);
  } else {
    if (!ctx.s.table?.hand) return;
    ctx.s.table.hand.mods.push(copy);
  }
  emit(ctx, { type: 'rulesChanged', reason: mod.source, rules: rulesOf(ctx) });
}

export function levelUpFigure(ctx: Ctx, figure: FigureId, levels = 1): void {
  const cur = ctx.s.figureLevels[figure] ?? 1;
  const next = Math.max(1, cur + Math.round(levels));
  ctx.s.figureLevels[figure] = next;
  emit(ctx, { type: 'figureLeveled', figure, level: next });
}

// ───────────────────────────── MutationApi ─────────────────────────────

/** API remise au contenu. `source` = porteur du crochet en cours (null pour un consommable). */
export function makeApi(ctx: Ctx, source: Holder | null): MutationApi {
  const api: MutationApi = {
    addMoney: (amount, reason) => void changeMoney(ctx, amount, reason),
    addRuleMod: (scope, mod) => addRuleMod(ctx, scope, mod),
    levelUpFigure: (figure, levels) => levelUpFigure(ctx, figure, levels ?? 1),

    enhanceCard: (cardId, enhancement: EnhancementId | null) =>
      modifyCard(ctx, cardId, (c) => {
        if (enhancement) c.enhancement = enhancement;
        else delete c.enhancement;
      }),
    changeSuit: (cardId, suit: Suit) => modifyCard(ctx, cardId, (c) => void (c.suit = suit)),
    changeRank: (cardId, rank: Rank) => modifyCard(ctx, cardId, (c) => void (c.rank = rank)),
    destroyCard: (cardId, reason) => destroyCard(ctx, cardId, reason),
    addCard: (card, toDrawPile) => addCardToDeck(ctx, card, toDrawPile ?? false),
    duplicateCard: (cardId) => {
      const src = findCard(ctx.s, cardId);
      if (!src) throw new Error(`duplicateCard : carte ${cardId} introuvable`);
      return addCardToDeck(ctx, src, false);
    },

    drawToPlayer: () => dealToPlayer(ctx, false),
    discardFromHand: (cardId) => void discardFromHand(ctx, cardId),
    burnTop: (owner) => {
      const t = ctx.s.table;
      if (!t || !tableInPlay(ctx.s)) return null;
      const card = takeTop(ctx, owner, false);
      if (!card) return null;
      (owner === 'player' ? t.discardPile : dealerDiscard(t)).push(card);
      emit(ctx, { type: 'cardBurned', owner, card: copyCard(card) });
      return copyCard(card);
    },
    peek: (owner, count) => {
      const t = ctx.s.table;
      if (!t || !tableInPlay(ctx.s)) return [];
      const pile = owner === 'player' ? t.drawPile : t.dealerDrawPile;
      const cards = pile.slice(0, Math.max(0, Math.floor(count))).map(copyCard);
      emit(ctx, { type: 'deckPeeked', owner, cards: cards.map(copyCard) });
      return cards;
    },
    revealHole: () => revealHole(ctx),
    swapWithDealer: (playerCardId, dealerCardId) => {
      const hand = ctx.s.table?.hand;
      if (!hand) return;
      const pi = hand.playerCards.findIndex((c) => c.id === playerCardId);
      const di = hand.dealerCards.findIndex((c) => c.id === dealerCardId);
      if (pi < 0 || di < 0) return;
      const p = hand.playerCards[pi];
      const d = hand.dealerCards[di];
      hand.playerCards[pi] = d;
      hand.dealerCards[di] = p;
      if (hand.hiddenCardIds) hand.hiddenCardIds = hand.hiddenCardIds.filter((x) => x !== playerCardId);
      emit(ctx, { type: 'cardsSwapped', playerCard: copyCard(p), dealerCard: copyCard(d) });
    },

    addAtout: (defId) => addAtout(ctx, defId),
    removeAtout: (uid) => void removeAtout(ctx, uid),
    addConsumable: (defId) => addConsumable(ctx, defId),

    setFlag: (scope, key, value) => {
      const bag = flagBag(ctx, scope);
      if (bag) bag[key] = value;
      ctx.seq++;
    },
    getFlag: (scope, key) => flagBag(ctx, scope)?.[key] ?? 0,

    trigger: (text) => {
      if (source?.kind === 'atout') emit(ctx, { type: 'atoutTriggered', uid: source.inst.uid, text });
      else if (source?.kind === 'boss') emit(ctx, { type: 'bossTriggered', bossId: source.def.id, text });
    },
    emit: (event) => {
      // rulesChanged émis à la main par le contenu : on y joint les règles effectives (Jauge).
      if (event.type === 'rulesChanged' && !event.rules) emit(ctx, { ...event, rules: rulesOf(ctx) });
      else emit(ctx, event);
    },
  };
  // Le contenu peut muter self.state puis appeler l'API dans le même crochet : chaque appel invalide
  // le cache de règles, pour que l'API voie toujours des règles à jour (ex. Ascenseur).
  for (const key of Object.keys(api) as (keyof MutationApi)[]) {
    const fn = api[key] as (...args: unknown[]) => unknown;
    (api as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => {
      ctx.seq++;
      return fn(...args);
    };
  }
  return api;
}

