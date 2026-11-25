/**
 * Faux moteur : implémente assez de `Engine` pour faire tourner l'UI (une partie jouable,
 * marquage complet, boutique simple) en attendant src/engine. Pas d'ambition d'équilibrage.
 * Option `stack` : impose les premières cartes des sabots (scénarios de démonstration).
 */
import type {
  Action, ActionType, AtoutInstance, Card, Content, DispatchResult, Engine, FigureId, FigurePreview,
  GameEvent, HandResult, HandValue, HookContext, MutationApi, Outcome, Rank, Rules, RunState, ScoreEffect,
  ScoreEffects, ScoringContext, ShopOffer, Suit, TableKind,
} from '../../engine/types';

type CardSpec = Omit<Card, 'id'>;
export interface FakeOptions {
  stack?: { player?: CardSpec[]; dealer?: CardSpec[] };
  atouts?: string[];
  consumables?: string[];
  money?: number;
  bossId?: string;
  tableIndex?: number;
  salon?: number;
  /** Objectif imposé (écrans de fin, boutique). */
  target?: number;
  rules?: Partial<Rules>;
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const KINDS: TableKind[] = ['petite', 'grande', 'patron'];

function rankValue(r: Rank): number {
  if (r === 'A') return 11;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

class Rand {
  constructor(public s: number) {}
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number): number { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function createFakeEngine(content: Content, opts: FakeOptions = {}): Engine {
  const B = content.balance;
  const atoutDef = (id: string) => content.atouts.find((a) => a.id === id)!;
  const consDef = (id: string) => content.consumables.find((c) => c.id === id)!;
  const bossDef = (id: string | null) => (id ? content.bosses.find((b) => b.id === id) ?? null : null);
  let stackUsed = false;

  function rulesOf(s: RunState): Rules {
    const r: Rules = { hidePlayerFirstCard: false, dealerExtraDraws: 0, freeRerollsPerShop: 0, rerollDiscount: 0, shredsPerShop: B.shredsPerShop, ...clone(B.baseRules) };
    if (opts.rules) Object.assign(r, opts.rules);
    const mods = [...s.runMods, ...(s.table?.mods ?? []), ...(s.table?.hand?.mods ?? [])];
    for (const m of mods) {
      if ('add' in m) (r as any)[m.key] += m.add;
      else (r as any)[m.key] = m.set;
    }
    const boss = s.table?.kind === 'patron' ? bossDef(s.table.bossId) : null;
    boss?.hooks.modifyRules?.(r, null, s);
    for (const a of s.atouts) atoutDef(a.defId)?.hooks.modifyRules?.(r, a, s);
    return r;
  }

  function value(cards: readonly Card[], limit: number): HandValue {
    let total = 0;
    let soft = 0;
    for (const c of cards) {
      if (c.enhancement === 'fantome') continue;
      total += rankValue(c.rank);
      if (c.rank === 'A') soft++;
      if (c.enhancement === 'elastique' && c.rank !== 'A') soft += 0; // simplifié
    }
    while (total > limit && soft > 0) {
      total -= 10;
      soft--;
    }
    return { total, soft: soft > 0, bust: total > limit };
  }

  function figuresOf(s: RunState, cards: readonly Card[], r: Rules): FigureId[] {
    const v = value(cards, r.playerLimit);
    const out: FigureId[] = [];
    if (v.bust) return ['petite'];
    const tens = cards.filter((c) => rankValue(c.rank) === 10).length;
    if (cards.length === 2 && cards.some((c) => c.rank === 'A') && tens === 1) out.push('blackjack');
    if (cards.filter((c) => c.rank === '7').length >= 3) out.push('triple7');
    if (cards.length >= r.charlieSize) out.push('charlie');
    if (v.total === r.playerLimit && !out.includes('blackjack')) out.push('pile');
    if (cards.length >= 3 && cards.every((c) => c.suit === cards[0].suit || c.enhancement === 'arlequin')) out.push('couleur');
    const ranks = new Map<string, number>();
    for (const c of cards) ranks.set(c.rank, (ranks.get(c.rank) ?? 0) + 1);
    if ([...ranks.values()].some((n) => n >= 2)) out.push('paire');
    if (v.total >= r.playerLimit - 4) out.push('haute');
    out.push('petite');
    void s;
    return out.sort((a, b) => content.figures[b].priority - content.figures[a].priority);
  }

  function newDeck(s: RunState): Card[] {
    const d: Card[] = [];
    for (const suit of SUITS) for (const rank of RANKS) d.push({ id: s.nextCardId++, rank, suit });
    return d;
  }

  function makeTable(s: RunState): void {
    const kind = KINDS[s.tableIndex];
    const r0 = rulesOf({ ...s, table: { kind, bossId: kind === 'patron' ? s.bossId : null } as any });
    const target = opts.target ?? Math.round(B.salonBaseTargets[s.salon - 1] * B.tableFactors[kind] * r0.targetFactor);
    s.table = {
      kind,
      bossId: kind === 'patron' ? s.bossId : null,
      target,
      score: 0,
      handIndex: 0,
      handsLeft: r0.handsPerTable,
      discardsLeft: r0.discardsPerTable,
      drawPile: [],
      discardPile: [],
      dealerDrawPile: [],
      mods: [],
      flags: {},
      hand: null,
    };
  }

  function newRun(seed = 'sabot'): DispatchResult {
    const s: RunState = {
      version: 1,
      seed,
      rngState: hashSeed(seed),
      phase: 'tableIntro',
      salon: opts.salon ?? 1,
      tableIndex: opts.tableIndex ?? 0,
      bossId: opts.bossId ?? 'la-pince',
      money: opts.money ?? B.startingMoney,
      deck: [],
      atouts: [],
      consumables: [],
      privileges: [],
      figureLevels: { blackjack: 1, triple7: 1, charlie: 1, pile: 1, couleur: 1, paire: 1, haute: 1, petite: 1 },
      runMods: [],
      table: null,
      shop: null,
      nextCardId: 1,
      nextUid: 1,
      stats: { handsPlayed: 0, handsWon: 0, busts: 0, dealerBusts: 0, blackjacks: 0, bestHandScore: 0, tablesWon: 0 },
      flags: {},
    };
    s.deck = newDeck(s);
    for (const id of opts.atouts ?? []) {
      const d = atoutDef(id);
      if (d) s.atouts.push({ uid: s.nextUid++, defId: id, state: d.initialState?.() ?? {} });
    }
    for (const id of opts.consumables ?? []) s.consumables.push({ uid: s.nextUid++, defId: id });
    makeTable(s);
    return { state: s, events: [{ type: 'salonStarted', salon: s.salon, bossId: s.bossId }] };
  }

  function legal(s: RunState): ActionType[] {
    const r = rulesOf(s);
    const out: ActionType[] = [];
    const h = s.table?.hand;
    switch (s.phase) {
      case 'tableIntro': out.push('startTable'); break;
      case 'playerTurn':
        out.push('hit', 'stand');
        if (h && h.playerCards.length === 2 && r.canDouble && !h.doubled) out.push('double');
        if (r.canDiscard && (s.table?.discardsLeft ?? 0) > 0 && (h?.playerCards.length ?? 0) > 0) out.push('discard');
        break;
      case 'bustChoice':
        out.push('acceptBust');
        if (r.canDiscard && (s.table?.discardsLeft ?? 0) > 0) out.push('discard');
        break;
      case 'handResult': out.push('nextHand'); break;
      case 'tableWon': out.push('cashOut'); break;
      case 'shop': out.push('buy', 'reroll', 'shredCard', 'leaveShop', 'sellAtout', 'sellConsumable', 'reorderAtouts'); break;
      default: break;
    }
    if (s.consumables.length && s.phase !== 'gameOver' && s.phase !== 'victory') out.push('useConsumable');
    if (s.atouts.length > 1 && !out.includes('reorderAtouts')) out.push('reorderAtouts');
    if (s.atouts.length && !out.includes('sellAtout') && s.phase === 'shop') out.push('sellAtout');
    return out;
  }

  function why(s: RunState, a: Action): string | null {
    const r = rulesOf(s);
    const h = s.table?.hand;
    switch (a.type) {
      case 'double':
        if (s.phase !== 'playerTurn') return 'Pas maintenant.';
        if (!r.canDouble) return 'Le patron t\'interdit de doubler.';
        if (h && h.playerCards.length !== 2) return 'On ne double qu\'avec deux cartes.';
        return null;
      case 'discard':
        if (s.phase !== 'playerTurn' && s.phase !== 'bustChoice') return 'Pas maintenant.';
        if (!r.canDiscard) return 'Le patron t\'interdit de défausser.';
        if ((s.table?.discardsLeft ?? 0) <= 0) return 'Plus de défausse à cette table.';
        return null;
      case 'buy': {
        const o = s.shop?.offers.find((x) => x.offerId === a.offerId);
        if (!o) return 'Introuvable.';
        if (o.sold) return 'Déjà vendu.';
        if (o.cost > s.money) return `Il te manque ${o.cost - s.money} $.`;
        if (o.kind === 'atout' && s.atouts.length >= r.atoutSlots) return 'Plus de place pour un atout.';
        if ((o.kind === 'combine' || o.kind === 'faveur') && s.consumables.length >= r.consumableSlots) return 'Tes poches sont pleines.';
        return null;
      }
      case 'reroll':
        if (!s.shop) return 'Pas de boutique.';
        if (s.shop.rerollCost > s.money) return `Il te manque ${s.shop.rerollCost - s.money} $.`;
        return null;
      case 'shredCard':
        if (!s.shop) return 'Pas de boutique.';
        if (s.shop.shredsLeft <= 0) return 'La Déchiqueteuse est enrayée jusqu\'à la prochaine boutique.';
        if (s.shop.shredCost > s.money) return `Il te manque ${s.shop.shredCost - s.money} $.`;
        return null;
      case 'useConsumable': {
        const c = s.consumables.find((x) => x.uid === a.uid);
        if (!c) return 'Introuvable.';
        const d = consDef(c.defId);
        if (!d.usableIn.includes(s.phase)) return 'Pas jouable maintenant.';
        if (d.canUse && !d.canUse(s, r)) return 'Sans effet maintenant.';
        return null;
      }
      default:
        return legal(s).includes(a.type) ? null : 'Pas maintenant.';
    }
  }

  function dispatch(state: RunState, action: Action): DispatchResult {
    const err = why(state, action);
    if (err) throw new Error(err);
    const s = clone(state);
    const ev: GameEvent[] = [];
    const rng = new Rand(s.rngState);
    const R = () => rulesOf(s);

    const api: MutationApi = {
      addMoney(amount, reason) { s.money += amount; ev.push({ type: 'moneyChanged', delta: amount, total: s.money, reason }); },
      addRuleMod(scope, mod) {
        const before = R().playerLimit;
        if (scope === 'hand' && s.table?.hand) s.table.hand.mods.push(mod);
        else if (scope === 'table' && s.table) s.table.mods.push(mod);
        else s.runMods.push(mod);
        void before;
        ev.push({ type: 'rulesChanged', reason: mod.source, rules: R() } as GameEvent);
      },
      levelUpFigure(f, n = 1) { s.figureLevels[f] += n; ev.push({ type: 'figureLeveled', figure: f, level: s.figureLevels[f] }); },
      enhanceCard(id, e) {
        const c = findCard(id);
        if (!c) return;
        const before = { ...c };
        if (e) c.enhancement = e; else delete c.enhancement;
        ev.push({ type: 'cardChanged', before, after: { ...c } });
      },
      changeSuit(id, suit) { const c = findCard(id); if (c) { const b = { ...c }; c.suit = suit; ev.push({ type: 'cardChanged', before: b, after: { ...c } }); } },
      changeRank(id, rank) { const c = findCard(id); if (c) { const b = { ...c }; c.rank = rank; ev.push({ type: 'cardChanged', before: b, after: { ...c } }); } },
      destroyCard(id, reason) {
        const c = findCard(id);
        if (!c) return;
        s.deck = s.deck.filter((x) => x.id !== id);
        if (s.table) {
          s.table.drawPile = s.table.drawPile.filter((x) => x.id !== id);
          if (s.table.hand) s.table.hand.playerCards = s.table.hand.playerCards.filter((x) => x.id !== id);
        }
        ev.push({ type: 'cardDestroyed', card: c, reason });
      },
      addCard(spec) { const c = { ...spec, id: s.nextCardId++ }; s.deck.push(c); ev.push({ type: 'cardAddedToDeck', card: c }); return c; },
      duplicateCard(id) { const c = findCard(id)!; return api.addCard({ rank: c.rank, suit: c.suit, enhancement: c.enhancement }); },
      drawToPlayer() { return drawPlayer(); },
      discardFromHand(id) { discardCard(id); },
      burnTop(owner) {
        const pile = owner === 'player' ? s.table!.drawPile : s.table!.dealerDrawPile;
        const c = pile.shift() ?? null;
        if (c) s.table!.discardPile.push(c);
        return c;
      },
      peek(owner, n) {
        const pile = owner === 'player' ? s.table!.drawPile : s.table!.dealerDrawPile;
        const cards = pile.slice(0, n);
        ev.push({ type: 'deckPeeked', owner, cards });
        return cards;
      },
      revealHole() {
        const h = s.table!.hand!;
        if (h.holeRevealed) return;
        h.holeRevealed = true;
        ev.push({ type: 'holeRevealed', card: h.dealerCards[1], total: value(h.dealerCards, R().dealerLimit).total });
      },
      swapWithDealer(pid, did) {
        const h = s.table!.hand!;
        const pi = h.playerCards.findIndex((c) => c.id === pid);
        const di = h.dealerCards.findIndex((c) => c.id === did);
        if (pi < 0 || di < 0) return;
        const p = h.playerCards[pi];
        const d = h.dealerCards[di];
        h.playerCards[pi] = d;
        h.dealerCards[di] = p;
        ev.push({ type: 'cardsSwapped', playerCard: p, dealerCard: d });
        checkBust();
      },
      addAtout(id) { const d = atoutDef(id); if (!d) return null; const a = { uid: s.nextUid++, defId: id, state: d.initialState?.() ?? {} }; s.atouts.push(a); ev.push({ type: 'atoutAdded', uid: a.uid, defId: id }); return a; },
      removeAtout(uid) { const a = s.atouts.find((x) => x.uid === uid); s.atouts = s.atouts.filter((x) => x.uid !== uid); if (a) ev.push({ type: 'atoutRemoved', uid, defId: a.defId }); },
      addConsumable(id) { const c = { uid: s.nextUid++, defId: id }; s.consumables.push(c); ev.push({ type: 'consumableAdded', uid: c.uid, defId: id }); return c; },
      setFlag(scope, k, v) { (scope === 'run' ? s.flags : scope === 'table' ? s.table!.flags : s.table!.hand!.flags)[k] = v; },
      getFlag(scope, k) { return (scope === 'run' ? s.flags : scope === 'table' ? s.table?.flags : s.table?.hand?.flags)?.[k] ?? 0; },
      trigger(text) { ev.push({ type: 'atoutTriggered', uid: currentUid, text }); },
      emit(e) { ev.push(e); },
    };
    let currentUid = 0;
    const hctx = (self: AtoutInstance | null): HookContext => ({ state: s, rules: R(), rng, self, api });

    function findCard(id: number): Card | undefined {
      return s.deck.find((c) => c.id === id) ?? s.table?.hand?.playerCards.find((c) => c.id === id) ?? s.table?.drawPile.find((c) => c.id === id);
    }

    function drawPlayer(): Card | null {
      const t = s.table!;
      const c = t.drawPile.shift() ?? null;
      if (!c) return null;
      t.hand!.playerCards.push(c);
      const v = value(t.hand!.playerCards, R().playerLimit);
      ev.push({ type: 'cardDealt', to: 'player', card: c, faceDown: false, total: v.total, soft: v.soft });
      return c;
    }

    function drawDealer(faceDown: boolean): Card {
      const t = s.table!;
      const c = t.dealerDrawPile.shift()!;
      t.hand!.dealerCards.push(c);
      const visible = t.hand!.holeRevealed ? t.hand!.dealerCards : [t.hand!.dealerCards[0]];
      const v = value(visible, R().dealerLimit);
      ev.push({ type: 'cardDealt', to: 'dealer', card: c, faceDown, total: v.total, soft: v.soft });
      return c;
    }

    function discardCard(id: number): void {
      const t = s.table!;
      const h = t.hand!;
      const c = h.playerCards.find((x) => x.id === id);
      if (!c) return;
      h.playerCards = h.playerCards.filter((x) => x.id !== id);
      t.discardPile.push(c);
      ev.push({ type: 'cardDiscarded', owner: 'player', card: c, total: value(h.playerCards, R().playerLimit).total });
    }

    function dealHand(): void {
      const t = s.table!;
      t.hand = { playerCards: [], dealerCards: [], holeRevealed: false, hits: 0, doubled: false, discards: 0, mods: [], flags: {}, result: null };
      ev.push({ type: 'handStarted', handIndex: t.handIndex, handsLeft: t.handsLeft });
      drawPlayer();
      drawDealer(false);
      drawPlayer();
      drawDealer(!R().seeDealerHole);
      if (R().seeDealerHole) t.hand.holeRevealed = true;
      s.phase = 'playerTurn';
    }

    function checkBust(): boolean {
      const h = s.table!.hand!;
      const r = R();
      const v = value(h.playerCards, r.playerLimit);
      if (!v.bust) {
        if (s.phase === 'bustChoice') {
          s.phase = 'playerTurn';
          ev.push({ type: 'bustRecovered', total: v.total });
        }
        return false;
      }
      const canRecover = (r.canDiscard && s.table!.discardsLeft > 0) || s.consumables.some((c) => consDef(c.defId).usableIn.includes('bustChoice'));
      ev.push({ type: 'playerBust', total: v.total, limit: r.playerLimit, canRecover });
      if (canRecover) s.phase = 'bustChoice';
      else resolve(true);
      return true;
    }

    function dealerPlay(): void {
      const h = s.table!.hand!;
      const r = R();
      if (!h.holeRevealed) {
        h.holeRevealed = true;
        ev.push({ type: 'holeRevealed', card: h.dealerCards[1], total: value(h.dealerCards, r.dealerLimit).total });
      }
      let v = value(h.dealerCards, r.dealerLimit);
      let guard = 0;
      while (v.total < r.dealerStandOn && guard++ < 12) {
        drawDealer(false);
        v = value(h.dealerCards, r.dealerLimit);
      }
      if (v.total > r.dealerLimit) ev.push({ type: 'dealerBust', total: v.total, limit: r.dealerLimit });
      else ev.push({ type: 'dealerStands', total: v.total });
    }

    function applyEffects(fx: ScoreEffects, source: any, cur: { chips: number; mult: number }): void {
      if (!fx) return;
      const list: ScoreEffect[] = Array.isArray(fx) ? fx : [fx];
      for (const e of list) {
        if (e.chips) cur.chips += e.chips;
        if (e.mult) cur.mult += e.mult;
        if (e.xMult) cur.mult = Math.round(cur.mult * e.xMult * 10) / 10;
        if (e.money) { s.money += e.money; }
        const text = e.text ?? (e.chips ? `+${e.chips}` : e.mult ? `+${e.mult} Mult` : e.xMult ? `×${String(e.xMult).replace('.', ',')} Mult` : e.money ? `+${e.money} $` : '');
        ev.push({ type: 'scoreStep', source, chips: e.chips, mult: e.mult, xMult: e.xMult, money: e.money, text, chipsAfter: cur.chips, multAfter: cur.mult });
        if (e.money) ev.push({ type: 'moneyChanged', delta: e.money, total: s.money, reason: 'marquage' });
      }
    }

    function resolve(bust: boolean): void {
      const t = s.table!;
      const h = t.hand!;
      const r = R();
      const pv = value(h.playerCards, r.playerLimit);
      if (!h.holeRevealed) {
        h.holeRevealed = true;
        ev.push({ type: 'holeRevealed', card: h.dealerCards[1], total: value(h.dealerCards, r.dealerLimit).total });
      }
      const dv = value(h.dealerCards, r.dealerLimit);
      const dealerBust = dv.total > r.dealerLimit;
      let outcome: Outcome;
      if (bust) outcome = 'bust';
      else if (dealerBust || pv.total > dv.total) outcome = 'win';
      else if (pv.total === dv.total) outcome = r.dealerWinsPush ? 'loss' : r.pushCountsAsWin ? 'win' : 'push';
      else outcome = 'loss';
      ev.push({ type: 'outcome', outcome, dealerBust, playerTotal: pv.total, dealerTotal: dv.total });
      const figs = figuresOf(s, h.playerCards, r);
      const figure = figs[0];
      const lvl = s.figureLevels[figure];
      const fd = content.figures[figure];
      const cur = { chips: fd.baseChips + fd.chipsPerLevel * (lvl - 1), mult: fd.baseMult + fd.multPerLevel * (lvl - 1) };
      let result: HandResult;
      if (outcome === 'bust') {
        result = { outcome, dealerBust, playerTotal: pv.total, dealerTotal: dv.total, figure, chips: 0, mult: 0, score: 0 };
        ev.push({ type: 'scoreEnd', outcome, chips: 0, mult: 0, handScore: 0, tableScore: t.score, target: t.target });
        s.stats.busts++;
      } else {
        ev.push({ type: 'scoreStart', figure, level: lvl, chips: cur.chips, mult: cur.mult });
        const boss = t.kind === 'patron' ? bossDef(t.bossId) : null;
        const sctx = (self: AtoutInstance | null): ScoringContext => ({
          state: s, rules: r, rng, self, playerCards: h.playerCards, dealerCards: h.dealerCards, playerTotal: pv.total,
          dealerTotal: dv.total, margin: pv.total - (dealerBust ? 0 : dv.total), outcome, dealerBust, figure, figures: figs,
          hits: h.hits, doubled: h.doubled, discards: h.discards, chips: cur.chips, mult: cur.mult,
        });
        for (const c of h.playerCards) {
          if (boss?.hooks.isCardDebuffed?.(c, s)) {
            ev.push({ type: 'scoreStep', source: { kind: 'boss', bossId: boss.id }, text: 'Neutralisée', chipsAfter: cur.chips, multAfter: cur.mult });
            continue;
          }
          applyEffects({ chips: rankValue(c.rank) }, { kind: 'card', cardId: c.id }, cur);
          if (c.enhancement === 'plombee') applyEffects({ chips: 30 }, { kind: 'enhancement', cardId: c.id, enhancement: 'plombee' }, cur);
          if (c.enhancement === 'ardente') applyEffects({ mult: 4 }, { kind: 'enhancement', cardId: c.id, enhancement: 'ardente' }, cur);
          if (c.enhancement === 'cristal') applyEffects({ xMult: 2 }, { kind: 'enhancement', cardId: c.id, enhancement: 'cristal' }, cur);
          if (c.enhancement === 'doree' && outcome === 'win') applyEffects({ money: 2 }, { kind: 'enhancement', cardId: c.id, enhancement: 'doree' }, cur);
          for (const a of s.atouts) {
            const fx = atoutDef(a.defId)?.hooks.onCardScored?.({ ...sctx(a), chips: cur.chips, mult: cur.mult }, c);
            applyEffects(fx, { kind: 'atout', uid: a.uid, cardId: c.id }, cur);
          }
        }
        for (const a of s.atouts) {
          const fx = atoutDef(a.defId)?.hooks.onHandScored?.({ ...sctx(a), chips: cur.chips, mult: cur.mult });
          applyEffects(fx, { kind: 'atout', uid: a.uid }, cur);
        }
        if (h.doubled) applyEffects({ xMult: r.doubleXMult, text: `×${r.doubleXMult} Doublé` }, { kind: 'rule', label: 'Doublé' }, cur);
        let mult = cur.mult;
        if (outcome === 'loss') mult = Math.max(1, Math.round(mult * r.lossMultKeep * 10) / 10);
        if (outcome === 'push') mult = Math.max(1, Math.round(mult * r.pushMultKeep * 10) / 10);
        const score = Math.round(cur.chips * mult);
        t.score += score;
        result = { outcome, dealerBust, playerTotal: pv.total, dealerTotal: dv.total, figure, chips: cur.chips, mult, score };
        ev.push({ type: 'scoreEnd', outcome, chips: cur.chips, mult, handScore: score, tableScore: t.score, target: t.target });
        s.stats.bestHandScore = Math.max(s.stats.bestHandScore, score);
        if (outcome === 'win') s.stats.handsWon++;
        if (figure === 'blackjack') s.stats.blackjacks++;
      }
      if (dealerBust) s.stats.dealerBusts++;
      s.stats.handsPlayed++;
      h.result = result;
      for (const a of s.atouts) {
        const before = JSON.stringify(a.state);
        atoutDef(a.defId)?.hooks.onHandEnd?.(hctx(a), result);
        if (JSON.stringify(a.state) !== before) ev.push({ type: 'atoutChanged', uid: a.uid });
      }
      t.handsLeft--;
      t.handIndex++;
      s.phase = 'handResult';
    }

    function makeShop(): void {
      const offers: ShopOffer[] = [];
      let oid = 1;
      const r = R();
      for (let i = 0; i < r.shopOffers; i++) {
        const roll = rng.next();
        if (roll < 0.6) {
          const d = rng.pick(content.atouts);
          offers.push({ offerId: oid++, kind: 'atout', defId: d.id, cost: d.cost, sold: false });
        } else if (roll < 0.85) {
          const d = rng.pick(content.consumables);
          offers.push({ offerId: oid++, kind: d.kind, defId: d.id, cost: d.cost, sold: false });
        } else {
          const card: Card = { id: s.nextCardId++, rank: rng.pick(RANKS), suit: rng.pick(SUITS), enhancement: rng.pick(['plombee', 'ardente', 'cristal', 'doree'] as const) };
          offers.push({ offerId: oid++, kind: 'card', defId: '', card, cost: 4, sold: false });
        }
      }
      const p = content.privileges.find((x) => !s.privileges.includes(x.id));
      if (p) offers.push({ offerId: oid++, kind: 'privilege', defId: p.id, cost: p.cost, sold: false });
      s.shop = { offers, rerollCost: s.shop?.rerollCost ?? B.rerollBaseCost, shredCost: B.shredBaseCost, shredsLeft: B.shredsPerShop };
    }

    switch (action.type) {
      case 'startTable': {
        makeTable(s);
        const t = s.table!;
        t.drawPile = rng.shuffle(s.deck.map((c) => ({ ...c })));
        const dealerDeck: Card[] = [];
        for (const suit of SUITS) for (const rank of RANKS) dealerDeck.push({ id: s.nextCardId++, rank, suit });
        t.dealerDrawPile = rng.shuffle(dealerDeck);
        if (opts.stack && !stackUsed) {
          stackUsed = true;
          const put = (pile: Card[], specs: CardSpec[] | undefined, fresh: boolean) => {
            (specs ?? []).slice().reverse().forEach((sp) => {
              const i = pile.findIndex((c) => c.rank === sp.rank && c.suit === sp.suit);
              let c: Card;
              if (i >= 0 && !fresh) c = pile.splice(i, 1)[0];
              else if (i >= 0) c = pile.splice(i, 1)[0];
              else c = { id: s.nextCardId++, rank: sp.rank, suit: sp.suit };
              if (sp.enhancement) {
                c.enhancement = sp.enhancement;
                const dc = s.deck.find((d) => d.id === c.id);
                if (dc) dc.enhancement = sp.enhancement;
              }
              pile.unshift(c);
            });
          };
          put(t.drawPile, opts.stack.player, false);
          put(t.dealerDrawPile, opts.stack.dealer, true);
        }
        ev.push({ type: 'tableStarted', kind: t.kind, bossId: t.bossId, target: t.target, salon: s.salon });
        dealHand();
        break;
      }
      case 'hit': {
        s.table!.hand!.hits++;
        drawPlayer();
        checkBust();
        break;
      }
      case 'double': {
        const h = s.table!.hand!;
        h.doubled = true;
        h.hits++;
        drawPlayer();
        if (!checkBust()) {
          dealerPlay();
          resolve(false);
        }
        break;
      }
      case 'stand':
        dealerPlay();
        resolve(false);
        break;
      case 'discard':
        s.table!.discardsLeft--;
        s.table!.hand!.discards++;
        discardCard(action.cardId);
        if (s.phase === 'bustChoice') checkBust();
        break;
      case 'acceptBust':
        resolve(true);
        break;
      case 'nextHand': {
        const t = s.table!;
        if (t.score >= t.target) {
          const reward = B.tableRewards[t.kind];
          const payout = [{ label: 'Table battue', amount: reward }];
          if (t.handsLeft > 0) payout.push({ label: `Mains non jouées (${t.handsLeft})`, amount: t.handsLeft * B.moneyPerUnusedHand });
          const interest = Math.min(R().interestCap, Math.floor(s.money / B.interestStep));
          if (interest > 0) payout.push({ label: 'Intérêts', amount: interest });
          const total = payout.reduce((a, p) => a + p.amount, 0);
          s.flags.pendingPayout = total;
          s.stats.tablesWon++;
          s.phase = 'tableWon';
          t.hand = null;
          ev.push({ type: 'tableWon', payout, total });
        } else if (t.handsLeft <= 0) {
          s.phase = 'gameOver';
          ev.push({ type: 'gameOver', reason: `Il te manquait ${t.target - t.score} points.` });
        } else {
          for (const c of t.hand!.playerCards) t.discardPile.push(c);
          dealHand();
        }
        break;
      }
      case 'cashOut': {
        const total = s.flags.pendingPayout ?? 0;
        s.flags.pendingPayout = 0;
        api.addMoney(total, 'Encaissement');
        if (s.table?.kind === 'patron' && s.salon >= B.salons) {
          s.phase = 'victory';
          ev.push({ type: 'victory' });
          break;
        }
        s.phase = 'shop';
        s.shop = null;
        makeShop();
        ev.push({ type: 'shopEntered' });
        break;
      }
      case 'buy': {
        const o = s.shop!.offers.find((x) => x.offerId === action.offerId)!;
        o.sold = true;
        s.money -= o.cost;
        ev.push({ type: 'moneyChanged', delta: -o.cost, total: s.money, reason: 'achat' });
        ev.push({ type: 'offerBought', offerId: o.offerId });
        if (o.kind === 'atout') api.addAtout(o.defId);
        else if (o.kind === 'combine' || o.kind === 'faveur') api.addConsumable(o.defId);
        else if (o.kind === 'card' && o.card) { s.deck.push(o.card); ev.push({ type: 'cardAddedToDeck', card: o.card }); }
        else if (o.kind === 'privilege') {
          s.privileges.push(o.defId);
          const p = content.privileges.find((x) => x.id === o.defId)!;
          for (const m of p.mods ?? []) s.runMods.push(m);
          ev.push({ type: 'privilegeGained', defId: o.defId });
          if (p.mods?.length) ev.push({ type: 'rulesChanged', reason: p.id, rules: R() } as GameEvent);
        }
        break;
      }
      case 'sellAtout': {
        const a = s.atouts.find((x) => x.uid === action.uid)!;
        const v = Math.max(1, Math.floor(atoutDef(a.defId).cost * B.sellRatio));
        api.removeAtout(a.uid);
        api.addMoney(v, 'vente');
        break;
      }
      case 'sellConsumable': {
        const c = s.consumables.find((x) => x.uid === action.uid)!;
        const v = Math.max(1, Math.floor(consDef(c.defId).cost * B.sellRatio));
        s.consumables = s.consumables.filter((x) => x.uid !== c.uid);
        ev.push({ type: 'consumableUsed', uid: c.uid, defId: c.defId });
        api.addMoney(v, 'vente');
        break;
      }
      case 'reroll': {
        s.money -= s.shop!.rerollCost;
        ev.push({ type: 'moneyChanged', delta: -s.shop!.rerollCost, total: s.money, reason: 'relance' });
        const rc = s.shop!.rerollCost + B.rerollCostStep;
        makeShop();
        s.shop!.rerollCost = rc;
        ev.push({ type: 'shopRerolled' });
        break;
      }
      case 'shredCard': {
        s.money -= s.shop!.shredCost;
        ev.push({ type: 'moneyChanged', delta: -s.shop!.shredCost, total: s.money, reason: 'Déchiqueteuse' });
        s.shop!.shredCost += B.shredCostStep;
        s.shop!.shredsLeft--;
        api.destroyCard(action.cardId, 'Déchiqueteuse');
        break;
      }
      case 'useConsumable': {
        const c = s.consumables.find((x) => x.uid === action.uid)!;
        s.consumables = s.consumables.filter((x) => x.uid !== c.uid);
        ev.push({ type: 'consumableUsed', uid: c.uid, defId: c.defId });
        consDef(c.defId).use(hctx(null), action.targets ?? []);
        if (s.phase === 'playerTurn' || s.phase === 'bustChoice') checkBust();
        break;
      }
      case 'reorderAtouts': {
        const order = action.order;
        s.atouts.sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid));
        break;
      }
      case 'leaveShop': {
        s.shop = null;
        if (s.tableIndex === 2) {
          s.salon++;
          s.tableIndex = 0;
          s.bossId = rng.pick(content.bosses.filter((b) => !b.finale && b.minSalon <= s.salon)).id;
          if (s.salon >= B.salons) s.bossId = content.bosses.find((b) => b.finale)?.id ?? s.bossId;
          ev.push({ type: 'salonStarted', salon: s.salon, bossId: s.bossId });
        } else {
          s.tableIndex++;
        }
        makeTable(s);
        s.phase = 'tableIntro';
        break;
      }
    }
    s.rngState = rng.s;
    return { state: s, events: ev };
  }

  return {
    content,
    newRun,
    dispatch,
    legalActions: legal,
    whyIllegal: why,
    getRules: rulesOf,
    handValue: value,
    previewFigure(s): FigurePreview | null {
      const h = s.table?.hand;
      if (!h || !h.playerCards.length) return null;
      const r = rulesOf(s);
      const figs = figuresOf(s, h.playerCards, r);
      const f = figs[0];
      const lvl = s.figureLevels[f];
      const d = content.figures[f];
      return { figure: f, figures: figs, level: lvl, chips: d.baseChips + d.chipsPerLevel * (lvl - 1), mult: d.baseMult + d.multPerLevel * (lvl - 1) };
    },
    visibleNextCard(s) {
      const top = s.table?.drawPile[0];
      if (!top) return null;
      return rulesOf(s).seeNextCard || top.enhancement === 'marquee' ? top : null;
    },
    isDebuffed(s, c) {
      const b = s.table?.kind === 'patron' ? bossDef(s.table.bossId) : null;
      return !!b?.hooks.isCardDebuffed?.(c, s);
    },
    sellValue(s, uid) {
      const a = s.atouts.find((x) => x.uid === uid);
      if (a) return Math.max(1, Math.floor(atoutDef(a.defId).cost * B.sellRatio));
      const c = s.consumables.find((x) => x.uid === uid);
      if (c) return Math.max(1, Math.floor(consDef(c.defId).cost * B.sellRatio));
      return 0;
    },
    serialize: (s) => JSON.stringify(s),
    deserialize: (j) => {
      try {
        const s = JSON.parse(j) as RunState;
        return s && s.version === 1 ? s : null;
      } catch {
        return null;
      }
    },
  };
}
