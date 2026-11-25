import { describe, expect, it } from 'vitest';
import { IllegalActionError } from './engine';
import { cardInvariantErrors, dealRigged, makeEngine, matches, ofType, startedRun, types, withAtouts, withConsumables } from './testing/helpers';
import type { RunState } from './types';

const e = makeEngine();
const base = (): RunState => startedRun(e, 'BUST');
const idOf = (s: RunState, spec: string): number => s.table!.hand!.playerCards.find((c) => matches(c, spec))!.id;

/** Rétablit l'ancienne règle « la défausse sauve d'un crevé » (ce que fera un atout du contenu). */
function discardSaves(s: RunState): RunState {
  const c = structuredClone(s);
  c.runMods.push({ key: 'discardAfterBust', set: true, source: 'test' });
  return c;
}

describe('crever (règle par défaut : la défausse ne sauve pas)', () => {
  it('crevé avec des défausses mais sans combine : résolu immédiatement', () => {
    const dealt = dealRigged(e, base(), ['10H', '6S', 'KC'], ['10C', '7D']).state;
    expect(e.getRules(dealt).discardAfterBust).toBe(false);
    const { state, events } = e.dispatch(dealt, { type: 'hit' });
    expect(ofType(events, 'playerBust')[0]).toEqual({ type: 'playerBust', total: 26, limit: 21, canRecover: false });
    expect(state.phase).toBe('handResult');
    expect(state.table!.hand!.result!.outcome).toBe('bust');
    expect(state.table!.discardsLeft).toBe(2);
    // Le croupier ne tire pas sur un crevé.
    expect(state.table!.hand!.dealerCards).toHaveLength(2);
  });

  it('en bustChoice (ouvert par une combine), défausser est refusé', () => {
    const s = withConsumables(base(), 't-elastique');
    const dealt = dealRigged(e, s, ['10H', '6S', 'KC'], ['10C', '7D']).state;
    const busted = e.dispatch(dealt, { type: 'hit' }).state;
    expect(busted.phase).toBe('bustChoice');
    expect(e.legalActions(busted)).toEqual(['acceptBust', 'useConsumable']);
    expect(e.whyIllegal(busted, { type: 'discard', cardId: idOf(busted, 'KC') })).toBe(
      'Trop tard : on défausse avant de crever.',
    );
    expect(() => e.dispatch(busted, { type: 'discard', cardId: idOf(busted, 'KC') })).toThrow(IllegalActionError);
  });

  it('accepter d’avoir crevé : la main marque 0, rien ne se déclenche', () => {
    const s = withConsumables(withAtouts(base(), 't-coeur', 't-boule'), 't-elastique');
    s.atouts[1].state.mult = 3;
    const dealt = dealRigged(e, s, ['10H', '6S', 'KH'], ['10C', '7D']).state;
    const busted = e.dispatch(dealt, { type: 'hit' }).state;
    expect(busted.phase).toBe('bustChoice');
    const { state, events } = e.dispatch(busted, { type: 'acceptBust' });
    expect(types(events)).toEqual(['holeRevealed', 'outcome', 'scoreEnd', 'atoutChanged']);
    expect(state.table!.hand!.result).toMatchObject({ outcome: 'bust', score: 0, chips: 0, mult: 0 });
    expect(state.atouts[1].state.mult).toBe(0); // onHandEnd appelé même sur un crevé
    expect(state.stats.busts).toBe(1);
    expect(state.stats.figureCounts).toEqual({});
  });

  it('Parachute (onBust) : sauvé sans consommer de défausse, une fois par table', () => {
    const s = withAtouts(base(), 't-parachute');
    const dealt = dealRigged(e, s, ['10H', '6S', 'KC', 'QC'], ['10C', '7D']).state;
    const { state, events } = e.dispatch(dealt, { type: 'hit' });
    expect(types(events)).toEqual(['cardDealt', 'atoutChanged', 'atoutTriggered', 'cardDiscarded', 'bustRecovered']);
    expect(ofType(events, 'atoutTriggered')[0].text).toBe('Parachute !');
    expect(state.phase).toBe('playerTurn');
    expect(state.table!.discardsLeft).toBe(2);
    // Deuxième crevé de la table : plus de parachute, et la défausse ne sauve pas.
    const again = e.dispatch(state, { type: 'hit' });
    expect(again.state.phase).toBe('handResult');
    expect(again.state.table!.hand!.result!.outcome).toBe('bust');
  });

  it('combine jouable en bustChoice (Élastique) : sauvetage', () => {
    const s = withConsumables(base(), 't-elastique');
    const dealt = dealRigged(e, s, ['10H', '6S', '6C'], ['10C', '7D']).state;
    const busted = e.dispatch(dealt, { type: 'hit' }).state;
    expect(busted.phase).toBe('bustChoice');
    expect(ofType(e.dispatch(dealt, { type: 'hit' }).events, 'playerBust')[0].canRecover).toBe(true);
    const { state, events } = e.dispatch(busted, { type: 'useConsumable', uid: busted.consumables[0].uid });
    expect(types(events)).toEqual(['consumableUsed', 'rulesChanged', 'bustRecovered']);
    expect(ofType(events, 'rulesChanged')[0].rules!.playerLimit).toBe(23);
    expect(state.phase).toBe('playerTurn');
    // Le mod de main s'éteint à la main suivante.
    const next = e.dispatch(e.dispatch(state, { type: 'stand' }).state, { type: 'nextHand' }).state;
    expect(e.getRules(next).playerLimit).toBe(21);
  });

  it('crevé après avoir doublé puis sauvé par une combine : ×2 gardé, le croupier joue aussitôt', () => {
    const s = withConsumables(base(), 't-elastique');
    const dealt = dealRigged(e, s, ['10H', '2S', 'KC'], ['10C', '6D', 'KD']).state;
    const busted = e.dispatch(dealt, { type: 'double' }).state;
    expect(busted.phase).toBe('bustChoice');
    const { state, events } = e.dispatch(busted, { type: 'useConsumable', uid: busted.consumables[0].uid });
    expect(types(events).slice(0, 5)).toEqual(['consumableUsed', 'rulesChanged', 'bustRecovered', 'holeRevealed', 'cardDealt']);
    expect(state.phase).toBe('handResult');
    // 22 avec une limite de 23 : main haute (20 Jetons, Mult 2) + 10 + 2 + 10 = 42 Jetons, ×2 doublé, croupier crevé.
    expect(state.table!.hand!.result).toMatchObject({ outcome: 'win', dealerBust: true, chips: 42, mult: 4, score: 168 });
  });

  it('défausser hors crevé, et refus explicites', () => {
    const dealt = dealRigged(e, base(), ['10H', '6S'], ['10C', '7D']).state;
    const d1 = e.dispatch(dealt, { type: 'discard', cardId: idOf(dealt, '6S') }).state;
    expect(d1.phase).toBe('playerTurn');
    expect(d1.table!.hand!.playerCards).toHaveLength(1);
    expect(e.whyIllegal(d1, { type: 'discard', cardId: d1.table!.hand!.playerCards[0].id })).toBe(
      'Garde au moins une carte en main.',
    );
    expect(e.whyIllegal(d1, { type: 'double' })).toBe("On ne double qu'avec deux cartes en main.");
    expect(e.whyIllegal(d1, { type: 'acceptBust' })).toBe("Tu n'as pas crevé.");
    expect(() => e.dispatch(d1, { type: 'nextHand' })).toThrow(IllegalActionError);
    expect(() => e.dispatch(d1, { type: 'nextHand' })).toThrow("La main n'est pas terminée.");
  });

  it('crevé dès la distribution (limite très basse)', () => {
    const s = structuredClone(base());
    s.runMods.push({ key: 'playerLimit', set: 15, source: 'test' });
    const { state, events } = dealRigged(e, s, ['10H', '9S'], ['10C', '7D']);
    expect(ofType(events, 'playerBust')[0]).toMatchObject({ total: 19, limit: 15, canRecover: false });
    expect(state.phase).toBe('handResult');
  });
});

describe('rules.discardAfterBust (atout) : la défausse sauve d’un crevé', () => {
  it('crevé avec une défausse en poche : phase bustChoice', () => {
    const dealt = dealRigged(e, discardSaves(base()), ['10H', '6S', 'KC'], ['10C', '7D']).state;
    const { state, events } = e.dispatch(dealt, { type: 'hit' });
    expect(state.phase).toBe('bustChoice');
    expect(ofType(events, 'playerBust')[0]).toEqual({ type: 'playerBust', total: 26, limit: 21, canRecover: true });
    expect(e.legalActions(state)).toEqual(expect.arrayContaining(['discard', 'acceptBust']));
    expect(e.legalActions(state)).not.toContain('hit');
  });

  it('défausser la carte fautive sauve la main et rend la main au joueur', () => {
    const dealt = dealRigged(e, discardSaves(base()), ['10H', '6S', 'KC'], ['10C', '7D']).state;
    const busted = e.dispatch(dealt, { type: 'hit' }).state;
    const { state, events } = e.dispatch(busted, { type: 'discard', cardId: idOf(busted, 'KC') });
    expect(types(events)).toEqual(['cardDiscarded', 'bustRecovered']);
    expect(state.phase).toBe('playerTurn');
    expect(state.table!.discardsLeft).toBe(1);
    expect(state.table!.hand!.discards).toBe(1);
    expect(cardInvariantErrors(state)).toEqual([]);
  });

  it('doublé, crevé, défaussé : ×2 gardé, le croupier joue aussitôt', () => {
    const dealt = dealRigged(e, discardSaves(base()), ['10H', '2S', 'KC'], ['10C', '6D', 'KD']).state;
    const busted = e.dispatch(dealt, { type: 'double' }).state;
    const { state, events } = e.dispatch(busted, { type: 'discard', cardId: idOf(busted, 'KC') });
    expect(types(events).slice(0, 4)).toEqual(['cardDiscarded', 'bustRecovered', 'holeRevealed', 'cardDealt']);
    // Petite main 10 + 10 + 2 = 22 Jetons, Mult 1 × 2 (doublé) = 2, croupier crevé.
    expect(state.table!.hand!.result).toMatchObject({ outcome: 'win', dealerBust: true, chips: 22, mult: 2, score: 44 });
  });

  it('plus de défausse : résolu immédiatement', () => {
    const dealt = dealRigged(e, discardSaves(base()), ['10H', '6S', 'KC'], ['10C', '7D'], { discardsUsed: 2 }).state;
    const { state, events } = e.dispatch(dealt, { type: 'hit' });
    expect(ofType(events, 'playerBust')[0].canRecover).toBe(false);
    expect(state.phase).toBe('handResult');
  });
});
