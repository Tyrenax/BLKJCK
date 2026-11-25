/**
 * Assainissement d'une sauvegarde contre le contenu ACTUEL. L'équilibrage change le contenu : une
 * sauvegarde peut référencer un atout, une combine, un privilège, un patron, une mise ou une clé de
 * règle qui n'existe plus, ou venir d'une version où il manquait des champs.
 *
 * Règle : ce qui est inconnu est retiré proprement (la partie continue sans) ; si la partie n'est
 * plus jouable (carte corrompue, état incohérent), on renvoie null et l'UI repart du titre.
 */
import { ENHANCEMENT_IDS, RANKS, SUITS } from './cards';
import { FIGURE_IDS } from './figures';
import type { Registry } from './registry';
import type { Card, FigureId, RuleMod, RunState, ShopOffer } from './types';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Garde uniquement les valeurs numériques finies (flags, compteurs d'atout). */
function numericBag(x: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObj(x)) for (const [k, v] of Object.entries(x)) if (isNum(v)) out[k] = v;
  return out;
}

class Unplayable extends Error {}

export function sanitizeState(reg: Registry, s: RunState): RunState | null {
  try {
    return clean(reg, s);
  } catch (e) {
    if (e instanceof Unplayable) return null;
    throw e;
  }
}

function clean(reg: Registry, s: RunState): RunState {
  const c = reg.content;
  const base = reg.baseRules as unknown as Record<string, unknown>;

  const validMod = (m: unknown): m is RuleMod => {
    if (!isObj(m) || typeof m.key !== 'string' || !(m.key in base)) return false;
    const kind = typeof base[m.key];
    if ('add' in m) return kind === 'number' && isNum(m.add);
    if ('set' in m) return (kind === 'number' && isNum(m.set)) || (kind === 'boolean' && typeof m.set === 'boolean');
    return false;
  };
  const cleanMods = (list: unknown): RuleMod[] => (Array.isArray(list) ? list.filter(validMod) : []);

  /** Une carte au rang ou à l'enseigne inconnus rend la partie injouable ; une amélioration inconnue est retirée. */
  const fixCard = (card: Card): Card => {
    if (!isObj(card) || !isNum(card.id) || !RANKS.includes(card.rank) || !SUITS.includes(card.suit)) {
      throw new Unplayable('carte corrompue');
    }
    if (card.enhancement !== undefined && !ENHANCEMENT_IDS.includes(card.enhancement)) delete card.enhancement;
    return card;
  };
  const fixCards = (list: Card[]): Card[] => list.map(fixCard);

  // ── Cartes ──
  s.deck = fixCards(s.deck);
  const t = s.table;
  if (t) {
    t.drawPile = fixCards(t.drawPile);
    t.discardPile = fixCards(t.discardPile);
    t.dealerDrawPile = fixCards(t.dealerDrawPile);
    if (t.dealerDiscardPile) t.dealerDiscardPile = fixCards(t.dealerDiscardPile);
    t.mods = cleanMods(t.mods);
    t.flags = numericBag(t.flags);
    if (t.bossId && !reg.bosses.has(t.bossId)) t.bossId = null;
    if (!isNum(t.target) || t.target <= 0) throw new Unplayable('objectif de table invalide');
    if (!isNum(t.score)) t.score = 0;
    const h = t.hand;
    if (h) {
      h.playerCards = fixCards(h.playerCards);
      h.dealerCards = fixCards(h.dealerCards);
      h.mods = cleanMods(h.mods);
      h.flags = numericBag(h.flags);
      if (!isNum(h.hits)) h.hits = 0;
      if (!isNum(h.discards)) h.discards = 0;
      h.doubled = h.doubled === true;
      h.holeRevealed = h.holeRevealed === true;
      if (h.hiddenCardIds && !Array.isArray(h.hiddenCardIds)) delete h.hiddenCardIds;
    }
    for (const k of ['handIndex', 'handsLeft', 'discardsLeft'] as const) if (!isNum(t[k])) t[k] = 0;
  }

  // ── Objets possédés ──
  s.atouts = s.atouts
    .filter((a) => isObj(a) && isNum(a.uid) && typeof a.defId === 'string' && reg.atouts.has(a.defId))
    .map((a) => ({ uid: a.uid, defId: a.defId, state: numericBag(a.state) }));
  s.consumables = s.consumables
    .filter((x) => isObj(x) && isNum(x.uid) && typeof x.defId === 'string' && reg.consumables.has(x.defId))
    .map((x) => ({ uid: x.uid, defId: x.defId }));
  s.privileges = s.privileges.filter((p) => typeof p === 'string' && reg.privileges.has(p));
  s.runMods = cleanMods(s.runMods);
  s.flags = numericBag(s.flags);

  // ── Figures : niveaux connus, ≥ 1 ──
  const levels = {} as Record<FigureId, number>;
  for (const f of FIGURE_IDS) {
    const v = (s.figureLevels as Record<string, unknown>)[f];
    levels[f] = isNum(v) && v >= 1 ? Math.floor(v) : 1;
  }
  s.figureLevels = levels;

  // ── Salon : patron, privilège, pots-de-vin, mise ──
  if (!reg.bosses.has(s.bossId)) s.bossId = '';
  s.bossHistory = (Array.isArray(s.bossHistory) ? s.bossHistory : []).filter((id) => typeof id === 'string' && reg.bosses.has(id));
  if (s.salonPrivilege && !reg.privileges.has(s.salonPrivilege)) s.salonPrivilege = null;
  if (Array.isArray(s.salonSkipRewards)) {
    s.salonSkipRewards = s.salonSkipRewards.map((id) => (typeof id === 'string' && reg.skipRewards.has(id) ? id : null));
  } else s.salonSkipRewards = [];
  if (s.stakeId !== undefined || s.stakeLevel !== undefined) {
    const idx = typeof s.stakeId === 'string' ? (c.stakes ?? []).findIndex((x) => x.id === s.stakeId) : -1;
    if (idx >= 0) s.stakeLevel = idx;
    else {
      delete s.stakeId;
      delete s.stakeLevel;
    }
  }
  if (s.deckId !== undefined && typeof s.deckId !== 'string') delete s.deckId;

  // ── Boutique : offres inconnues retirées ──
  if (s.shop) {
    const known = (o: ShopOffer): boolean => {
      if (!isObj(o) || !isNum(o.offerId) || !isNum(o.cost)) return false;
      if (o.kind === 'atout') return reg.atouts.has(o.defId);
      if (o.kind === 'combine' || o.kind === 'faveur') return reg.consumables.has(o.defId);
      if (o.kind === 'privilege') return reg.privileges.has(o.defId);
      if (o.kind === 'card') {
        if (!o.card) return false;
        fixCard(o.card);
        return true;
      }
      return false;
    };
    s.shop.offers = s.shop.offers.filter(known);
    for (const k of ['rerollCost', 'shredCost', 'shredsLeft'] as const) if (!isNum(s.shop[k])) s.shop[k] = 0;
  }

  // ── Résumé : entrées abîmées retirées ──
  if (s.history !== undefined) {
    s.history = Array.isArray(s.history) ? s.history.filter((r) => isObj(r) && isNum(r.salon) && isNum(r.target) && isNum(r.score)) : [];
  }
  if (s.bestHand !== undefined) {
    const b = s.bestHand;
    if (!isObj(b) || !isNum(b.score) || !Array.isArray(b.cards) || !FIGURE_IDS.includes(b.figure)) delete s.bestHand;
    else {
      try {
        b.cards = fixCards(b.cards);
      } catch {
        delete s.bestHand;
      }
    }
  }
  if (s.death !== undefined && !(isObj(s.death) && isNum(s.death.missing))) delete s.death;
  if (s.seen !== undefined) {
    const seen: Record<string, unknown> = isObj(s.seen) ? s.seen : {};
    const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
    s.seen = { atouts: strs(seen.atouts), consumables: strs(seen.consumables), privileges: strs(seen.privileges) };
  }

  // ── Compteurs : jamais sous les identifiants déjà utilisés ──
  if (!isNum(s.money) || s.money < 0) s.money = Math.max(0, isNum(s.money) ? s.money : 0);
  if (!Number.isInteger(s.salon) || s.salon < 1) throw new Unplayable('salon invalide');
  let maxCard = 0;
  const seeCards = (list: readonly Card[] | undefined) => {
    for (const card of list ?? []) maxCard = Math.max(maxCard, card.id);
  };
  seeCards(s.deck);
  if (t) {
    seeCards(t.drawPile);
    seeCards(t.discardPile);
    seeCards(t.dealerDrawPile);
    seeCards(t.dealerDiscardPile);
    seeCards(t.hand?.playerCards);
    seeCards(t.hand?.dealerCards);
  }
  for (const o of s.shop?.offers ?? []) if (o.card) maxCard = Math.max(maxCard, o.card.id);
  if (!isNum(s.nextCardId) || s.nextCardId <= maxCard) s.nextCardId = maxCard + 1;
  let maxUid = 0;
  for (const x of [...s.atouts, ...s.consumables]) maxUid = Math.max(maxUid, x.uid);
  for (const o of s.shop?.offers ?? []) maxUid = Math.max(maxUid, o.offerId);
  if (!isNum(s.nextUid) || s.nextUid <= maxUid) s.nextUid = maxUid + 1;
  return s;
}
