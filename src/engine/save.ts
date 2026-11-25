/** Sauvegarde : RunState est du JSON pur. deserialize vérifie la forme et complète les champs facultatifs. */
import type { Card, HandState, Phase, RuleMod, RunState, ShopState, TableState } from './types';

export const SAVE_VERSION = 1;

export const PHASES: readonly Phase[] = [
  'tableIntro',
  'playerTurn',
  'bustChoice',
  'handResult',
  'tableWon',
  'shop',
  'gameOver',
  'victory',
];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isCard = (x: unknown): x is Card =>
  isObj(x) && isNum(x.id) && typeof x.rank === 'string' && typeof x.suit === 'string';
const isCardList = (x: unknown): x is Card[] => Array.isArray(x) && x.every(isCard);

function looksLikeRunState(x: unknown): x is RunState {
  if (!isObj(x)) return false;
  if (x.version !== SAVE_VERSION || typeof x.seed !== 'string' || !isNum(x.rngState)) return false;
  if (!PHASES.includes(x.phase as Phase)) return false;
  if (!isNum(x.salon) || !isNum(x.tableIndex) || !isNum(x.money) || typeof x.bossId !== 'string') return false;
  if (!isCardList(x.deck) || !Array.isArray(x.atouts) || !Array.isArray(x.consumables)) return false;
  if (!Array.isArray(x.privileges) || !Array.isArray(x.runMods) || !isObj(x.figureLevels)) return false;
  if (!isNum(x.nextCardId) || !isNum(x.nextUid) || !isObj(x.stats) || !isObj(x.flags)) return false;
  const phase = x.phase as Phase;
  if (x.table !== null) {
    const t = x.table;
    if (!isObj(t)) return false;
    if (!isCardList(t.drawPile) || !isCardList(t.discardPile) || !isCardList(t.dealerDrawPile)) return false;
    if (!isNum(t.target) || !isNum(t.score) || !Array.isArray(t.mods) || !isObj(t.flags)) return false;
    if (t.hand !== null) {
      const h = t.hand;
      if (!isObj(h) || !isCardList(h.playerCards) || !isCardList(h.dealerCards) || !Array.isArray(h.mods)) return false;
    }
  }
  if (x.shop !== null && !(isObj(x.shop) && Array.isArray(x.shop.offers))) return false;
  const needsTable: Phase[] = ['tableIntro', 'playerTurn', 'bustChoice', 'handResult', 'tableWon'];
  if (needsTable.includes(phase) && !x.table) return false;
  if ((phase === 'playerTurn' || phase === 'bustChoice' || phase === 'handResult') && !(x.table as { hand: unknown }).hand) {
    return false;
  }
  if (phase === 'shop' && !x.shop) return false;
  return true;
}

/** Complète les champs facultatifs ajoutés au contrat après coup (mutation en place). */
export function normalizeState(s: RunState): RunState {
  s.bossHistory ??= [];
  if (s.salonPrivilege === undefined) s.salonPrivilege = null;
  s.stats.cardsShredded ??= 0;
  s.stats.tablesSkipped ??= 0;
  s.stats.figureCounts ??= {};
  s.salonSkipRewards ??= [];
  const t = s.table;
  if (t) {
    t.dealerDiscardPile ??= [];
    t.discardsUsed ??= 0;
    t.handsDealt ??= s.phase === 'tableIntro' ? 0 : t.handIndex + 1;
  }
  if (s.shop) {
    s.shop.freeRerollsLeft ??= 0;
    s.shop.rerollsPaid ??= 0;
  }
  return s;
}

const cc = (c: Card): Card => ({ ...c });
const cards = (list: readonly Card[]): Card[] => list.map(cc);
const mods = (list: readonly RuleMod[]): RuleMod[] => list.map((m) => ({ ...m }));

function cloneHand(h: HandState): HandState {
  const out: HandState = {
    ...h,
    playerCards: cards(h.playerCards),
    dealerCards: cards(h.dealerCards),
    mods: mods(h.mods),
    flags: { ...h.flags },
    result: h.result ? { ...h.result } : null,
  };
  if (h.hiddenCardIds) out.hiddenCardIds = [...h.hiddenCardIds];
  return out;
}

function cloneTable(t: TableState): TableState {
  const out: TableState = {
    ...t,
    drawPile: cards(t.drawPile),
    discardPile: cards(t.discardPile),
    dealerDrawPile: cards(t.dealerDrawPile),
    mods: mods(t.mods),
    flags: { ...t.flags },
    hand: t.hand ? cloneHand(t.hand) : null,
  };
  if (t.dealerDiscardPile) out.dealerDiscardPile = cards(t.dealerDiscardPile);
  if (t.payout) out.payout = t.payout.map((l) => ({ ...l }));
  return out;
}

function cloneShop(shop: ShopState): ShopState {
  return {
    ...shop,
    offers: shop.offers.map((o) => {
      const copy = { ...o };
      if (o.card) copy.card = cc(o.card);
      return copy;
    }),
  };
}

/**
 * Copie profonde d'un RunState, ~30× plus rapide que structuredClone (mesuré par bjck-6a).
 * Doit suivre la forme de RunState : tout nouveau champ objet/tableau du contrat doit être copié ici.
 */
export function cloneState(s: Readonly<RunState>): RunState {
  const out: RunState = {
    ...s,
    deck: cards(s.deck),
    atouts: s.atouts.map((a) => ({ ...a, state: { ...a.state } })),
    consumables: s.consumables.map((c) => ({ ...c })),
    privileges: [...s.privileges],
    figureLevels: { ...s.figureLevels },
    runMods: mods(s.runMods),
    table: s.table ? cloneTable(s.table) : null,
    shop: s.shop ? cloneShop(s.shop) : null,
    stats: s.stats.figureCounts ? { ...s.stats, figureCounts: { ...s.stats.figureCounts } } : { ...s.stats },
    flags: { ...s.flags },
  };
  if (s.bossHistory) out.bossHistory = [...s.bossHistory];
  if (s.salonSkipRewards) out.salonSkipRewards = [...s.salonSkipRewards];
  if (s.history) out.history = s.history.map((r) => ({ ...r }));
  if (s.bestHand) out.bestHand = { ...s.bestHand, cards: cards(s.bestHand.cards) };
  if (s.death) out.death = { ...s.death };
  if (s.seen) out.seen = { atouts: [...s.seen.atouts], consumables: [...s.seen.consumables], privileges: [...s.seen.privileges] };
  return out;
}

export function serializeState(s: RunState): string {
  return JSON.stringify(s);
}

export function deserializeState(json: string): RunState | null {
  try {
    const raw: unknown = JSON.parse(json);
    return looksLikeRunState(raw) ? normalizeState(raw) : null;
  } catch {
    return null;
  }
}
