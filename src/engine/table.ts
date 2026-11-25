/**
 * Déroulé d'une partie : salons, tables, mains, croupier, verdict, fin de table.
 *
 * Machine à états :
 *   tableIntro --startTable--> playerTurn <--> bustChoice
 *   playerTurn --stand / double--> (croupier, marquage) --> handResult
 *   bustChoice --acceptBust / plus de recours--> handResult
 *   handResult --nextHand--> playerTurn (main suivante) | tableWon | gameOver | victory
 *   tableWon --cashOut--> shop --leaveShop--> tableIntro
 *   tableIntro (petite / grande) --skipTable--> tableIntro de la table suivante (pot-de-vin)
 */
import { copyCard, handValue, isTenRank, makeStandardDeck } from './cards';
import { canRecover } from './checks';
import {
  callHook,
  changeMoney,
  type Ctx,
  dealToDealer,
  dealToPlayer,
  dealerDiscard,
  destroyCard,
  discardFromHand,
  eachHolder,
  emit,
  HookError,
  hookContext,
  isPlayerOwned,
  markSeen,
  revealHole,
  revealPlayerCards,
  rulesOf,
  runSimpleHook,
} from './core';
import { detectFigures } from './figures';
import { ENHANCEMENT_VALUES, scoreHand } from './scoring';
import { enterShop } from './shop';
import type { BossDef, Card, HandResult, HandValue, Outcome, PayoutLine, TableKind, TableRecord } from './types';

const TABLE_KINDS: readonly TableKind[] = ['petite', 'grande', 'patron'];
export const TABLE_LABELS: Record<TableKind, string> = {
  petite: 'Petite table',
  grande: 'Grande table',
  patron: 'Table du patron',
};

// ───────────────────────────── Salons et tables ─────────────────────────────

function pickBoss(ctx: Ctx, salon: number): BossDef | null {
  const all = ctx.reg.content.bosses;
  const salons = ctx.reg.content.balance.salons;
  const final = salon === salons;
  const advance = rulesOf(ctx).bossSalonAdvance ?? 0;
  const eligible = (b: BossDef): boolean => (b.minSalon ?? 1) <= salon + advance;
  // Mode sans fin (au-delà du dernier salon) : patrons tirés parmi tous.
  let pool =
    salon > salons ? [...all] : final ? all.filter((b) => b.finale) : all.filter((b) => !b.finale && eligible(b));
  if (pool.length === 0) pool = all.filter((b) => !b.finale && eligible(b));
  if (pool.length === 0) pool = all.filter((b) => !b.finale);
  if (pool.length === 0) pool = [...all];
  if (pool.length === 0) return null;
  const history = ctx.s.bossHistory ?? [];
  const fresh = pool.filter((b) => !history.includes(b.id));
  return ctx.rng.pick(fresh.length ? fresh : pool);
}

function pickPrivilege(ctx: Ctx): string | null {
  const owned = new Set(ctx.s.privileges);
  const pool = ctx.reg.content.privileges.filter(
    (p) =>
      !owned.has(p.id) &&
      (!p.requires || owned.has(p.requires)) &&
      (p.minSalon ?? 1) <= ctx.s.salon &&
      (!p.canAppear || p.canAppear(ctx.s)),
  );
  return pool.length ? ctx.rng.pick(pool).id : null;
}

/** Pots-de-vin des tables 0 (petite) et 1 (grande) : distincts si possible. */
function pickSkipRewards(ctx: Ctx, salon: number): (string | null)[] {
  const pool = (ctx.reg.content.skipRewards ?? []).filter((r) => (r.minSalon ?? 1) <= salon);
  if (pool.length === 0) return [null, null];
  const first = ctx.rng.pick(pool);
  const rest = pool.filter((r) => r !== first);
  const second = rest.length ? ctx.rng.pick(rest) : first;
  return [first.id, second.id];
}

/** Début de salon : le patron, le privilège et les pots-de-vin du salon sont tirés tout de suite. */
export function startSalon(ctx: Ctx, salon: number): void {
  const s = ctx.s;
  s.salon = salon;
  s.tableIndex = 0;
  const boss = pickBoss(ctx, salon);
  s.bossId = boss?.id ?? '';
  if (boss) (s.bossHistory ??= []).push(boss.id);
  s.salonPrivilege = pickPrivilege(ctx);
  if (s.salonPrivilege) markSeen(s, 'privileges', s.salonPrivilege);
  s.salonSkipRewards = pickSkipRewards(ctx, salon);
  emit(ctx, { type: 'salonStarted', salon, bossId: s.bossId });
}

/**
 * Pot-de-vin : la table (petite ou grande) est sautée, sans gain ni boutique. La table suivante est
 * présentée, puis la récompense s'applique (un mod de portée 'table' vise donc la table suivante).
 */
export function skipTable(ctx: Ctx): void {
  const s = ctx.s;
  const kind = s.table!.kind;
  const idx = s.tableIndex;
  const rewardId = s.salonSkipRewards![idx]!;
  const def = ctx.reg.skipRewards.get(rewardId)!;
  s.salonSkipRewards![idx] = null;
  s.stats.tablesSkipped = (s.stats.tablesSkipped ?? 0) + 1;
  pushHistory(ctx, tableRecord(ctx, 'skipped', 0, rewardId));
  emit(ctx, { type: 'tableSkipped', kind, rewardId });
  s.tableIndex = idx + 1;
  createTableIntro(ctx);
  try {
    def.grant.call(def, hookContext(ctx, null));
  } catch (e) {
    throw new HookError(`Pot-de-vin « ${def.name} » : ${e instanceof Error ? e.message : String(e)}`, e);
  }
  ctx.seq++;
  syncTable(ctx);
}

export function computeTarget(ctx: Ctx): number {
  const s = ctx.s;
  const b = ctx.reg.content.balance;
  const targets = b.salonBaseTargets;
  let base = 100;
  if (targets.length) {
    base =
      s.salon <= targets.length
        ? targets[s.salon - 1]
        : targets[targets.length - 1] * Math.pow(b.endlessGrowth ?? 2, s.salon - targets.length);
  }
  const kind = s.table?.kind ?? 'petite';
  return Math.max(1, Math.round(base * (b.tableFactors[kind] ?? 1) * rulesOf(ctx).targetFactor));
}

/** Prépare la table suivante (phase tableIntro) : objectif connu, sabots pas encore mélangés. */
export function createTableIntro(ctx: Ctx): void {
  const s = ctx.s;
  const kind = TABLE_KINDS[Math.max(0, Math.min(2, s.tableIndex))];
  s.table = {
    kind,
    bossId: kind === 'patron' && s.bossId ? s.bossId : null,
    target: 0,
    score: 0,
    handIndex: 0,
    handsLeft: 0,
    discardsLeft: 0,
    drawPile: [],
    discardPile: [],
    dealerDrawPile: [],
    dealerDiscardPile: [],
    mods: [],
    flags: {},
    hand: null,
    handsDealt: 0,
    discardsUsed: 0,
  };
  s.phase = 'tableIntro';
  syncTable(ctx);
}

/** Recalcule les compteurs dérivés des règles (mains et défausses restantes, objectif avant lancement). */
export function syncTable(ctx: Ctx): void {
  const t = ctx.s.table;
  if (!t) return;
  const r = rulesOf(ctx);
  t.handsLeft = Math.max(0, r.handsPerTable - (t.handsDealt ?? 0));
  t.discardsLeft = Math.max(0, r.discardsPerTable - (t.discardsUsed ?? 0));
  if (ctx.s.phase === 'tableIntro') t.target = computeTarget(ctx);
}

export function startTable(ctx: Ctx): void {
  const s = ctx.s;
  const t = s.table!;
  t.target = computeTarget(ctx);
  t.drawPile = ctx.rng.shuffle(s.deck.map(copyCard));
  t.discardPile = [];
  t.dealerDrawPile = ctx.rng.shuffle(makeStandardDeck(s.nextCardId));
  s.nextCardId += 52;
  t.dealerDiscardPile = [];
  t.score = 0;
  t.handsDealt = 0;
  t.discardsUsed = 0;
  t.handIndex = 0;
  t.hand = null;
  delete t.payout;
  s.phase = 'playerTurn';
  syncTable(ctx);
  emit(ctx, { type: 'tableStarted', kind: t.kind, bossId: t.bossId, target: t.target, salon: s.salon });
  runSimpleHook(ctx, 'onTableStart');
  dealHand(ctx);
}

// ───────────────────────────── Une main ─────────────────────────────

export function dealHand(ctx: Ctx): void {
  const s = ctx.s;
  const t = s.table!;
  t.handsDealt = (t.handsDealt ?? 0) + 1;
  t.handIndex = t.handsDealt - 1;
  t.hand = {
    playerCards: [],
    dealerCards: [],
    holeRevealed: false,
    hits: 0,
    doubled: false,
    discards: 0,
    mods: [],
    flags: {},
    result: null,
  };
  s.phase = 'playerTurn';
  syncTable(ctx);
  emit(ctx, { type: 'handStarted', handIndex: t.handIndex, handsLeft: t.handsLeft });
  dealToPlayer(ctx, rulesOf(ctx).hidePlayerFirstCard);
  dealToDealer(ctx, false);
  dealToPlayer(ctx, false);
  dealToDealer(ctx, true);
  runSimpleHook(ctx, 'onHandStart');
  settle(ctx);
}

export function hit(ctx: Ctx): void {
  ctx.s.table!.hand!.hits++;
  dealToPlayer(ctx, false);
  settle(ctx);
}

/** Doubler : une carte, Mult ×doubleXMult au marquage, puis on reste (même après un sauvetage). */
export function double(ctx: Ctx): void {
  const hand = ctx.s.table!.hand!;
  hand.hits++;
  hand.doubled = true;
  dealToPlayer(ctx, false);
  settle(ctx);
}

/** Défausse volontaire (consomme une défausse de la table). */
export function playerDiscard(ctx: Ctx, cardId: number): void {
  const t = ctx.s.table!;
  const hand = t.hand!;
  const card = discardFromHand(ctx, cardId);
  if (!card) return;
  t.discardsUsed = (t.discardsUsed ?? 0) + 1;
  hand.discards++;
  syncTable(ctx);
  eachHolder(ctx, (h, hooks) => {
    const fn = hooks.onDiscard;
    if (fn) callHook(ctx, h, 'onDiscard', () => fn.call(hooks, hookContext(ctx, h), copyCard(card)));
  });
  settle(ctx);
}

/** Premier crochet onBust qui renvoie un sauvetage valide : la carte part à la défausse (gratuite). */
function tryBustSave(ctx: Ctx): boolean {
  const hand = ctx.s.table!.hand!;
  let saved = false;
  eachHolder(ctx, (h, hooks) => {
    if (saved || !hooks.onBust) return;
    const fn = hooks.onBust;
    const res = callHook(ctx, h, 'onBust', () => fn.call(hooks, hookContext(ctx, h)));
    if (!res || !hand.playerCards.some((c) => c.id === res.discardCardId)) return;
    const text = res.text ?? 'Sauvé !';
    if (h.kind === 'atout') emit(ctx, { type: 'atoutTriggered', uid: h.inst.uid, text });
    else if (h.kind === 'boss') emit(ctx, { type: 'bossTriggered', bossId: h.def.id, text });
    discardFromHand(ctx, res.discardCardId);
    saved = true;
  });
  return saved;
}

/**
 * Point de passage après toute action pendant une main : détecte le crevé, appelle les sauvetages,
 * ouvre bustChoice s'il reste un recours, sinon résout la main ; enchaîne le croupier après un Doubler.
 */
export function settle(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase !== 'playerTurn' && s.phase !== 'bustChoice') return;
  const hand = s.table?.hand;
  if (!hand) return;
  const value = (): HandValue => handValue(hand.playerCards, rulesOf(ctx).playerLimit);
  let v = value();

  if (s.phase === 'playerTurn' && v.bust) {
    let saved = false;
    for (let guard = 0; guard < 8 && v.bust; guard++) {
      if (!tryBustSave(ctx)) break;
      saved = true;
      v = value();
    }
    if (v.bust) {
      revealPlayerCards(ctx);
      s.phase = 'bustChoice';
      const r = rulesOf(ctx);
      const can = canRecover(ctx.reg, s, r);
      emit(ctx, { type: 'playerBust', total: v.total, limit: r.playerLimit, canRecover: can });
      if (!can) resolveBust(ctx);
      return;
    }
    if (saved) emit(ctx, { type: 'bustRecovered', total: v.total });
  } else if (s.phase === 'bustChoice') {
    if (v.bust) {
      if (!canRecover(ctx.reg, s, rulesOf(ctx))) resolveBust(ctx);
      return;
    }
    s.phase = 'playerTurn';
    emit(ctx, { type: 'bustRecovered', total: v.total });
  }

  if (s.phase === 'playerTurn' && hand.doubled) resolveStand(ctx);
}

export function resolveStand(ctx: Ctx): void {
  revealPlayerCards(ctx);
  dealerPlay(ctx);
  finishHand(ctx, false);
}

export function resolveBust(ctx: Ctx): void {
  revealPlayerCards(ctx);
  revealHole(ctx);
  finishHand(ctx, true);
}

/** Le croupier retourne sa carte et tire tant qu'il est sous son seuil, puis ses tirages forcés. */
function dealerPlay(ctx: Ctx): void {
  const hand = ctx.s.table!.hand!;
  revealHole(ctx);
  let r = rulesOf(ctx);
  let v = handValue(hand.dealerCards, r.dealerLimit);
  let guard = 0;
  while (!v.bust && v.total < r.dealerStandOn && guard++ < 60) {
    if (!dealToDealer(ctx, false)) break;
    r = rulesOf(ctx);
    v = handValue(hand.dealerCards, r.dealerLimit);
  }
  let extra = r.dealerExtraDraws;
  while (!v.bust && extra > 0 && guard++ < 80) {
    extra--;
    if (!dealToDealer(ctx, false)) break;
    r = rulesOf(ctx);
    v = handValue(hand.dealerCards, r.dealerLimit);
  }
  if (v.bust) emit(ctx, { type: 'dealerBust', total: v.total, limit: r.dealerLimit });
  else emit(ctx, { type: 'dealerStands', total: v.total });
}

/** Blackjack naturel du croupier : ses 2 cartes de départ, As + 10/V/D/R, total 21. */
export function isDealerNatural(cards: readonly Card[], v: HandValue): boolean {
  if (cards.length !== 2 || v.bust || v.total !== 21) return false;
  const [a, b] = cards;
  return (a.rank === 'A' && isTenRank(b.rank)) || (b.rank === 'A' && isTenRank(a.rank));
}

function finishHand(ctx: Ctx, bust: boolean): void {
  const s = ctx.s;
  const t = s.table!;
  const hand = t.hand!;
  const r = rulesOf(ctx);
  const pv = handValue(hand.playerCards, r.playerLimit);
  const dv = handValue(hand.dealerCards, r.dealerLimit);
  const figures = detectFigures(ctx.reg.content, hand.playerCards, pv, r, hand.hits);
  const figure = figures[0];

  let outcome: Outcome;
  let dealerBust = false;
  if (bust || pv.bust) {
    outcome = 'bust';
  } else if (dv.bust) {
    outcome = 'win';
    dealerBust = true;
  } else {
    // Le total le plus haut gagne ; à total égal, un Blackjack naturel bat une main qui n'en est pas un.
    let raw: 'win' | 'push' | 'loss';
    if (pv.total !== dv.total) {
      raw = pv.total > dv.total ? 'win' : 'loss';
    } else {
      const pNat = figures.includes('blackjack');
      const dNat = isDealerNatural(hand.dealerCards, dv);
      raw = pNat === dNat ? 'push' : pNat ? 'win' : 'loss';
    }
    if (raw === 'push') raw = r.dealerWinsPush ? 'loss' : r.pushCountsAsWin ? 'win' : 'push';
    outcome = raw;
  }
  emit(ctx, { type: 'outcome', outcome, dealerBust, playerTotal: pv.total, dealerTotal: dv.total });

  let result: HandResult;
  let cristal: number[] = [];
  if (outcome === 'bust') {
    result = { outcome, dealerBust, playerTotal: pv.total, dealerTotal: dv.total, figure, chips: 0, mult: 0, score: 0 };
  } else {
    const out = scoreHand(ctx, {
      outcome,
      dealerBust,
      playerTotal: pv.total,
      dealerTotal: dv.total,
      figure,
      figures,
    });
    cristal = out.cristalScored;
    result = {
      outcome,
      dealerBust,
      playerTotal: pv.total,
      dealerTotal: dv.total,
      figure,
      chips: out.chips,
      mult: out.mult,
      score: out.score,
    };
  }

  t.score += result.score;
  hand.result = result;
  const st = s.stats;
  st.handsPlayed++;
  if (outcome === 'win') {
    st.handsWon++;
    t.handsWon = (t.handsWon ?? 0) + 1;
  }
  if (outcome !== 'bust' && result.score > (s.bestHand?.score ?? -1)) {
    s.bestHand = {
      score: result.score,
      figure,
      chips: result.chips,
      mult: result.mult,
      salon: s.salon,
      outcome,
      cards: hand.playerCards.map(copyCard),
    };
  }
  if (outcome === 'bust') st.busts++;
  if (dealerBust) st.dealerBusts++;
  if (outcome !== 'bust' && figure === 'blackjack') st.blackjacks++;
  st.bestHandScore = Math.max(st.bestHandScore, result.score);
  if (outcome !== 'bust') {
    st.figureCounts ??= {};
    st.figureCounts[figure] = (st.figureCounts[figure] ?? 0) + 1;
  }
  emit(ctx, {
    type: 'scoreEnd',
    outcome,
    chips: result.chips,
    mult: result.mult,
    handScore: result.score,
    tableScore: t.score,
    target: t.target,
  });
  s.phase = 'handResult';

  eachHolder(ctx, (h, hooks) => {
    const fn = hooks.onHandEnd;
    if (fn) callHook(ctx, h, 'onHandEnd', () => fn.call(hooks, hookContext(ctx, h), { ...result }));
  });

  for (const id of cristal) {
    if (hand.playerCards.some((c) => c.id === id) && ctx.rng.chance(ENHANCEMENT_VALUES.cristalBreakChance)) {
      destroyCard(ctx, id, 'Le cristal se brise');
    }
  }
}

// ───────────────────────────── Fin de main, fin de table ─────────────────────────────

/** Les cartes de la main retournent à la défausse de leur propriétaire. */
function clearHand(ctx: Ctx): void {
  const t = ctx.s.table!;
  const hand = t.hand;
  if (!hand) return;
  for (const c of [...hand.playerCards, ...hand.dealerCards]) {
    (isPlayerOwned(ctx.s, c.id) ? t.discardPile : dealerDiscard(t)).push(c);
  }
  t.hand = null;
}

export function nextHand(ctx: Ctx): void {
  const t = ctx.s.table!;
  clearHand(ctx);
  syncTable(ctx);
  if (t.score >= t.target) {
    winTable(ctx);
    return;
  }
  if (t.handsLeft <= 0) {
    endRun(ctx, `Objectif manqué : ${t.score} / ${t.target}`);
    return;
  }
  dealHand(ctx);
}

function winTable(ctx: Ctx): void {
  const s = ctx.s;
  const t = s.table!;
  const b = ctx.reg.content.balance;
  s.stats.tablesWon++;
  if (t.kind === 'patron' && s.salon >= b.salons && !s.endless) {
    pushHistory(ctx, tableRecord(ctx, 'won', 0));
    s.phase = 'victory';
    emit(ctx, { type: 'victory' });
    return;
  }
  const total = enterTableWon(ctx);
  pushHistory(ctx, tableRecord(ctx, 'won', total));
}

/** Mode sans fin : après la victoire, on encaisse la table du patron et la partie continue. */
export function continueEndless(ctx: Ctx): void {
  ctx.s.endless = true;
  const total = enterTableWon(ctx);
  const last = ctx.s.history?.at(-1);
  if (last && last.result === 'won') last.payout = total;
}

/** Table gagnée : crochets de fin de table, gains détaillés, phase tableWon. Renvoie le total. */
function enterTableWon(ctx: Ctx): number {
  const s = ctx.s;
  const t = s.table!;
  const b = ctx.reg.content.balance;
  s.phase = 'tableWon';
  runSimpleHook(ctx, 'onTableEnd');
  syncTable(ctx);
  const r = rulesOf(ctx);
  const lines: PayoutLine[] = [{ label: `${TABLE_LABELS[t.kind]} battue`, amount: b.tableRewards[t.kind] ?? 0 }];
  const unused = t.handsLeft;
  if (unused > 0 && b.moneyPerUnusedHand > 0) {
    lines.push({
      label: `${unused} main${unused > 1 ? 's' : ''} non jouée${unused > 1 ? 's' : ''}`,
      amount: unused * b.moneyPerUnusedHand,
    });
  }
  const interest = Math.min(r.interestCap, Math.floor(s.money / Math.max(1, b.interestStep)));
  if (interest > 0) lines.push({ label: 'Intérêts', amount: interest });
  t.payout = lines;
  const total = lines.reduce((a, l) => a + l.amount, 0);
  emit(ctx, { type: 'tableWon', payout: lines.map((l) => ({ ...l })), total });
  return total;
}

// ───────────────────────────── Résumé de partie ─────────────────────────────

export const MAX_HISTORY = 64;

function tableRecord(ctx: Ctx, result: TableRecord['result'], payout: number, skipRewardId?: string): TableRecord {
  const s = ctx.s;
  const t = s.table!;
  const rec: TableRecord = {
    salon: s.salon,
    kind: t.kind,
    bossId: t.bossId,
    target: t.target,
    score: t.score,
    handsPlayed: result === 'skipped' ? 0 : (t.handsDealt ?? 0),
    handsWon: t.handsWon ?? 0,
    payout,
    result,
  };
  if (skipRewardId) rec.skipRewardId = skipRewardId;
  return rec;
}

function pushHistory(ctx: Ctx, rec: TableRecord): void {
  const h = (ctx.s.history ??= []);
  h.push(rec);
  if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
}

export function cashOut(ctx: Ctx): void {
  const s = ctx.s;
  const t = s.table!;
  const total = (t.payout ?? []).reduce((a, l) => a + l.amount, 0);
  if (total) changeMoney(ctx, total, 'Gains de la table');
  const wasBoss = t.kind === 'patron';
  s.table = null;
  if (wasBoss) startSalon(ctx, s.salon + 1);
  else s.tableIndex++;
  enterShop(ctx);
}

export function endRun(ctx: Ctx, reason: string): void {
  const s = ctx.s;
  const t = s.table;
  if (t) {
    pushHistory(ctx, tableRecord(ctx, 'lost', 0));
    s.death = {
      salon: s.salon,
      kind: t.kind,
      bossId: t.bossId,
      target: t.target,
      score: t.score,
      missing: Math.max(0, t.target - t.score),
    };
  }
  s.phase = 'gameOver';
  emit(ctx, { type: 'gameOver', reason });
}
