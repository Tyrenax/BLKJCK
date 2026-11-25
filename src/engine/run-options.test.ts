import { describe, expect, it } from 'vitest';
import { makeTestContent } from './testing/content';
import { cardInvariantErrors, makeEngine, ofType, play, types } from './testing/helpers';

const e = makeEngine();

describe('sabots de départ', () => {
  it('par défaut : le premier sabot du contenu, mémorisé dans le state', () => {
    const { state } = e.newRun('DECK');
    expect(state.deckId).toBe('t-classique');
    expect(state.deck).toHaveLength(52);
  });

  it('sabot rouge : 52 cartes rouges, ids uniques, la suite des ids continue', () => {
    const { state } = e.newRun('DECK', { deckId: 't-rouge' });
    expect(state.deckId).toBe('t-rouge');
    expect(state.deck).toHaveLength(52);
    expect(state.deck.every((c) => c.suit === 'hearts' || c.suit === 'diamonds')).toBe(true);
    expect(new Set(state.deck.map((c) => c.id)).size).toBe(52);
    expect(state.nextCardId).toBe(53);
    const started = e.dispatch(state, { type: 'startTable' }).state;
    expect(cardInvariantErrors(started)).toEqual([]);
  });

  it('sabot du tricheur : As marqués, une défausse de moins, combine offerte au départ', () => {
    const { state, events } = e.newRun('DECK', { deckId: 't-tricheur' });
    expect(state.deck.filter((c) => c.enhancement === 'marquee').map((c) => c.rank)).toEqual(['A', 'A', 'A', 'A']);
    expect(state.table!.discardsLeft).toBe(1);
    expect(state.consumables.map((c) => c.defId)).toEqual(['t-elastique']);
    expect(types(events)).toEqual(['consumableAdded', 'salonStarted']);
  });

  it('sabot du flambeur : +10 $ et plus d’intérêts', () => {
    const { state } = e.newRun('DECK', { deckId: 't-flambeur' });
    expect(state.money).toBe(4 + 10);
    expect(e.getRules(state).interestCap).toBe(0);
  });

  it('sabot inconnu : erreur explicite ; sans sabots dans le contenu : 52 cartes standard', () => {
    expect(() => e.newRun('DECK', { deckId: 'nope' })).toThrow('Sabot de départ inconnu');
    const bare = makeEngine(makeTestContent({ startingDecks: undefined }));
    const { state } = bare.newRun('DECK');
    expect(state.deckId).toBeUndefined();
    expect(state.deck).toHaveLength(52);
  });

  it('même graine + même sabot = même partie', () => {
    expect(e.newRun('S', { deckId: 't-rouge' }).state).toEqual(e.newRun('S', { deckId: 't-rouge' }).state);
  });
});

describe('pot-de-vin', () => {
  it('les deux récompenses du salon sont tirées avec le patron', () => {
    const { state } = e.newRun('SKIP');
    expect(state.salonSkipRewards).toHaveLength(2);
    expect(new Set(state.salonSkipRewards).size).toBe(2);
    expect(e.legalActions(state)).toEqual(['startTable', 'skipTable']);
  });

  it('sauter la petite table : récompense, pas de gain, pas de boutique', () => {
    const state = structuredClone(e.newRun('SKIP').state);
    state.salonSkipRewards = ['t-enveloppe', 't-rallonge'];
    const { state: next, events } = e.dispatch(state, { type: 'skipTable' });
    expect(types(events)).toEqual(['tableSkipped', 'moneyChanged']);
    expect(ofType(events, 'tableSkipped')[0]).toEqual({ type: 'tableSkipped', kind: 'petite', rewardId: 't-enveloppe' });
    expect(next.phase).toBe('tableIntro');
    expect(next.tableIndex).toBe(1);
    expect(next.table!.kind).toBe('grande');
    expect(next.money).toBe(state.money + 5);
    expect(next.salonSkipRewards).toEqual([null, 't-rallonge']);
    expect(next.stats.tablesSkipped).toBe(1);
    expect(next.shop).toBeNull();
  });

  it('une récompense de portée « table » vise la table suivante', () => {
    const state = structuredClone(e.newRun('SKIP').state);
    state.salonSkipRewards = ['t-rallonge', 't-enveloppe'];
    const next = e.dispatch(state, { type: 'skipTable' }).state;
    expect(next.table!.handsLeft).toBe(5);
    const started = e.dispatch(next, { type: 'startTable' }).state;
    expect(started.table!.handsLeft).toBe(4); // 5 mains, une distribuée
  });

  it('jamais à la table du patron, jamais en pleine table', () => {
    let state = e.newRun('SKIP').state;
    const twice = play(e, state, [{ type: 'skipTable' }, { type: 'skipTable' }]).state;
    expect(twice.table!.kind).toBe('patron');
    expect(e.whyIllegal(twice, { type: 'skipTable' })).toBe('On ne soudoie pas le patron.');
    expect(e.legalActions(twice)).toEqual(['startTable']);
    state = e.dispatch(state, { type: 'startTable' }).state;
    expect(e.whyIllegal(state, { type: 'skipTable' })).toBe("Le pot-de-vin se négocie avant de s'asseoir.");
    const none = makeEngine(makeTestContent({ skipRewards: undefined })).newRun('SKIP').state;
    expect(e.whyIllegal(none, { type: 'skipTable' })).toBe('Personne à soudoyer à cette table.');
  });
});
