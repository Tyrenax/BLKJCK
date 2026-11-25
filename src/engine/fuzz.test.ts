/**
 * Tests de robustesse : des milliers d'actions légales tirées au hasard, avec vérification des
 * invariants après chacune ; déterminisme ; sauvegarde.
 */
import { describe, expect, it } from 'vitest';
import { IllegalActionError, type SabotEngine } from './engine';
import { createRng } from './rng';
import { makeTestContent, testBalance, testStartingDecks } from './testing/content';
import { cardInvariantErrors, deepFreeze, makeEngine, startedRun } from './testing/helpers';
import type { Action, ActionType, GameEvent, RunState } from './types';

/** Sabot de départ déterministe par graine : le fuzz parcourt tous les sabots de test. */
const deckFor = (seed: string): string =>
  testStartingDecks[[...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0) % testStartingDecks.length].id;

/** Objectifs bas pour que les parties aléatoires traversent boutiques, salons et patrons. */
const fuzzEngine = makeEngine(
  makeTestContent({ balance: { ...testBalance, salonBaseTargets: [40, 70, 110], startingMoney: 30 } }),
);

/** Seul gameOver termine vraiment une partie : depuis victory, on peut continuer en mode sans fin. */
const TERMINAL = new Set(['gameOver']);

function invariantErrors(e: SabotEngine, s: RunState): string[] {
  const errs = cardInvariantErrors(s);
  if (!Number.isInteger(s.money) || s.money < 0) errs.push(`argent invalide : ${s.money}`);
  const tablePhases = ['tableIntro', 'playerTurn', 'bustChoice', 'handResult', 'tableWon'];
  if (tablePhases.includes(s.phase) && !s.table) errs.push(`phase ${s.phase} sans table`);
  if (['playerTurn', 'bustChoice', 'handResult'].includes(s.phase) && !s.table?.hand) errs.push(`phase ${s.phase} sans main`);
  if (s.phase === 'handResult' && !s.table?.hand?.result) errs.push('handResult sans résultat');
  if (s.phase === 'shop' && !s.shop) errs.push('boutique absente');
  if (s.phase === 'playerTurn' && e.handValue(s.table!.hand!.playerCards, e.getRules(s).playerLimit).bust) {
    errs.push('playerTurn alors que le joueur a crevé');
  }
  if (s.atouts.length > Math.max(e.getRules(s).atoutSlots, 0) + 5) errs.push('trop d’atouts');
  const uids = [...s.atouts.map((a) => a.uid), ...s.consumables.map((c) => c.uid)];
  if (new Set(uids).size !== uids.length) errs.push('uid en double');
  const legal = e.legalActions(s);
  if (!TERMINAL.has(s.phase) && legal.length === 0) errs.push(`aucune action légale en ${s.phase}`);
  if (TERMINAL.has(s.phase) && legal.length !== 0) errs.push('actions légales après la fin');
  if (s.phase === 'victory' && JSON.stringify(legal) !== JSON.stringify(['continueEndless'])) {
    errs.push('victory : seule continueEndless doit être légale');
  }
  if (s.history && s.history.length > 64) errs.push('history trop long');
  if (s.phase === 'gameOver' && !s.death) errs.push('gameOver sans death');
  const back = e.deserialize(e.serialize(s));
  if (!back || JSON.stringify(back) !== JSON.stringify(s)) errs.push('sérialisation non idempotente');
  return errs;
}

interface RunLog {
  actions: Action[];
  final: RunState;
  events: GameEvent[];
}

/** Joue une partie au hasard : type d'action uniforme parmi les légaux, puis action concrète au hasard. */
function randomRun(e: SabotEngine, seed: string, maxActions: number, check: boolean): RunLog {
  const pick = createRng({ rngState: 0x9e3779b9 ^ seed.length * 7919 });
  for (const ch of seed) pick.int(0, ch.charCodeAt(0));
  let { state } = e.newRun(seed, { deckId: deckFor(seed) });
  const actions: Action[] = [];
  const events: GameEvent[] = [];
  for (let i = 0; i < maxActions && !TERMINAL.has(state.phase); i++) {
    const all = e.enumerateActions(state);
    const kinds = [...new Set(all.map((a) => a.type))] as ActionType[];
    // On bride la sortie de boutique et le lancement pour explorer un peu chaque écran.
    const weighted = kinds.flatMap((k) => (k === 'leaveShop' || k === 'reorderAtouts' ? [k] : [k, k, k]));
    const kind = pick.pick(weighted);
    const action = pick.pick(all.filter((a) => a.type === kind));
    const input = check ? deepFreeze(structuredClone(state)) : state;
    const before = check ? JSON.stringify(input) : '';
    const r = e.dispatch(input, action);
    if (check) {
      expect(JSON.stringify(input)).toBe(before);
      const errs = invariantErrors(e, r.state);
      if (errs.length) throw new Error(`${seed} #${i} ${JSON.stringify(action)} : ${errs.join(' ; ')}`);
    }
    actions.push(action);
    events.push(...r.events);
    state = r.state;
  }
  return { actions, final: state, events };
}

describe('fuzz', () => {
  it('des milliers d’actions légales au hasard : aucune exception, invariants tenus', () => {
    let total = 0;
    const phases = new Set<string>();
    let salonsMax = 0;
    for (let run = 0; run < 60; run++) {
      const log = randomRun(fuzzEngine, `FUZZ-${run}`, 300, true);
      total += log.actions.length;
      for (const ev of log.events) if (ev.type === 'shopEntered') phases.add('shop');
      phases.add(log.final.phase);
      salonsMax = Math.max(salonsMax, log.final.salon);
    }
    expect(total).toBeGreaterThan(3000);
    expect(phases.has('shop')).toBe(true);
    expect(phases.has('gameOver')).toBe(true);
    expect(salonsMax).toBeGreaterThan(1);
  }, 120_000);

  it('les actions illégales sont refusées sans toucher au state', () => {
    const e = fuzzEngine;
    const pick = createRng({ rngState: 1234 });
    let { state } = e.newRun('ILLEGAL');
    const junk: Action[] = [
      { type: 'hit' },
      { type: 'stand' },
      { type: 'double' },
      { type: 'discard', cardId: -1 },
      { type: 'acceptBust' },
      { type: 'nextHand' },
      { type: 'cashOut' },
      { type: 'buy', offerId: -1 },
      { type: 'sellAtout', uid: -1 },
      { type: 'reroll' },
      { type: 'shredCard', cardId: -1 },
      { type: 'useConsumable', uid: -1 },
      { type: 'reorderAtouts', order: [-1] },
      { type: 'leaveShop' },
      { type: 'startTable' },
      { type: 'bogus' } as unknown as Action,
    ];
    for (let i = 0; i < 300 && !TERMINAL.has(state.phase); i++) {
      for (const a of junk) {
        const why = e.whyIllegal(state, a);
        if (why === null) continue;
        expect(typeof why).toBe('string');
        const frozen = deepFreeze(structuredClone(state));
        expect(() => e.dispatch(frozen, a)).toThrow(IllegalActionError);
      }
      const legal = e.enumerateActions(state);
      for (const a of legal) expect(e.whyIllegal(state, a)).toBeNull();
      state = e.dispatch(state, pick.pick(legal)).state;
    }
  }, 60_000);
});

describe('déterminisme', () => {
  it('même graine + mêmes actions = mêmes states et mêmes événements', () => {
    for (const seed of ['DET-1', 'DET-2', 'DET-3']) {
      const a = randomRun(fuzzEngine, seed, 300, false);
      // Rejoue les mêmes actions à partir de zéro.
      let { state } = fuzzEngine.newRun(seed, { deckId: deckFor(seed) });
      const events: GameEvent[] = [];
      for (const act of a.actions) {
        const r = fuzzEngine.dispatch(state, act);
        state = r.state;
        events.push(...r.events);
      }
      expect(state).toEqual(a.final);
      expect(events).toEqual(a.events);
    }
  });

  it('deux graines différentes donnent des parties différentes', () => {
    const a = startedRun(fuzzEngine, 'ONE');
    const b = startedRun(fuzzEngine, 'TWO');
    expect(a.table!.drawPile.map((c) => c.id)).not.toEqual(b.table!.drawPile.map((c) => c.id));
  });

  it('reprendre depuis une sauvegarde ne change pas la suite', () => {
    const a = randomRun(fuzzEngine, 'SAVE-MID', 60, false);
    const mid = fuzzEngine.deserialize(fuzzEngine.serialize(a.final))!;
    if (TERMINAL.has(mid.phase)) return;
    const next = fuzzEngine.enumerateActions(mid)[0];
    expect(fuzzEngine.dispatch(mid, next)).toEqual(fuzzEngine.dispatch(a.final, next));
  });
});

describe('sauvegarde', () => {
  const e = makeEngine();

  it('aller-retour JSON identique', () => {
    const s = startedRun(e, 'SAVE');
    const json = e.serialize(s);
    expect(typeof json).toBe('string');
    expect(e.deserialize(json)).toEqual(s);
  });

  it('refuse ce qui n’est pas une partie valide', () => {
    const s = startedRun(e, 'SAVE');
    expect(e.deserialize('pas du json')).toBeNull();
    expect(e.deserialize('null')).toBeNull();
    expect(e.deserialize('{}')).toBeNull();
    expect(e.deserialize(JSON.stringify({ ...s, version: 999 }))).toBeNull();
    expect(e.deserialize(JSON.stringify({ ...s, phase: 'nimporte' }))).toBeNull();
    expect(e.deserialize(JSON.stringify({ ...s, table: null }))).toBeNull();
    expect(e.deserialize(JSON.stringify({ ...s, deck: [{ id: 'x' }] }))).toBeNull();
  });

  it('complète les champs facultatifs d’une vieille sauvegarde', () => {
    const s = structuredClone(startedRun(e, 'OLD')) as RunState & Record<string, unknown>;
    delete s.bossHistory;
    delete s.salonPrivilege;
    delete s.table!.dealerDiscardPile;
    delete s.table!.discardsUsed;
    const back = e.deserialize(JSON.stringify(s))!;
    expect(back.bossHistory).toEqual([]);
    expect(back.salonPrivilege).toBeNull();
    expect(back.table!.dealerDiscardPile).toEqual([]);
    expect(back.table!.discardsUsed).toBe(0);
    expect(() => e.dispatch(back, { type: 'stand' })).not.toThrow();
  });
});

describe('cloneState', () => {
  it('copie profonde équivalente à structuredClone, sans partage', async () => {
    const { cloneState } = await import('./save');
    const log = randomRun(fuzzEngine, 'CLONE', 120, false);
    const states = [fuzzEngine.newRun('C').state, startedRun(fuzzEngine, 'C2'), log.final];
    for (const s of states) {
      const c = cloneState(s);
      expect(c).toEqual(structuredClone(s));
      // Aucune référence partagée : geler l'original puis muter la copie ne doit pas lever.
      deepFreeze(s);
      c.deck.forEach((card) => (card.rank = 'A'));
      c.atouts.forEach((a) => (a.state.x = 1));
      if (c.table) {
        c.table.drawPile.forEach((card) => (card.suit = 'hearts'));
        c.table.mods.push({ key: 'playerLimit', add: 1, source: 't' });
        if (c.table.hand) c.table.hand.playerCards.forEach((card) => (card.rank = 'K'));
      }
      c.shop?.offers.forEach((o) => {
        o.sold = true;
        if (o.card) o.card.rank = 'Q';
      });
      c.stats.handsPlayed++;
    }
  });
});

describe('dispatchQuiet (mode silencieux du simulateur)', () => {
  it('même state final et même rngState qu’avec le journal, à chaque action', async () => {
    const { content: real } = await import('../content');
    for (const eng of [fuzzEngine, makeEngine(real)]) {
      for (const seed of ['Q1', 'Q2', 'Q3', 'Q4']) {
        const pick = createRng({ rngState: seed.charCodeAt(1) * 7 });
        let loud = eng.newRun(seed).state;
        let quiet = structuredClone(loud);
        for (let i = 0; i < 250 && !TERMINAL.has(loud.phase); i++) {
          const acts = eng.enumerateActions(loud);
          const a = pick.pick(acts);
          loud = eng.dispatch(loud, a).state;
          quiet = eng.dispatchQuiet(quiet, a);
          expect(quiet.rngState).toBe(loud.rngState);
          expect(JSON.stringify(quiet)).toBe(JSON.stringify(loud));
        }
      }
    }
  });

  it('refuse les mêmes actions illégales et ne mute pas son entrée', () => {
    const s = deepFreeze(structuredClone(fuzzEngine.newRun('QI').state));
    expect(() => fuzzEngine.dispatchQuiet(s, { type: 'hit' })).toThrow(IllegalActionError);
    expect(() => fuzzEngine.dispatchQuiet(s, { type: 'startTable' })).not.toThrow();
  });
});
