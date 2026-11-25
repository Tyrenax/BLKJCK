import { describe, expect, it } from 'vitest';
import type { Card } from '../engine/types';
import { balance } from './balance';
import { startingDecks } from './decks';
import { skipRewards } from './skips';
import { byId, fakeRng, fullDeck, hookCtx, makeState } from './test/helpers';

const standard = (): Omit<Card, 'id'>[] => fullDeck().map(({ id: _id, ...c }) => c);

describe('sabots de départ', () => {
  it('le classique est le premier, sans modification', () => {
    expect(startingDecks[0]!.id).toBe('sabot-classique');
    expect(startingDecks[0]!.buildDeck).toBeUndefined();
  });

  it('chaque sabot reste au-dessus du plancher et ne contient que des cartes valides', () => {
    const floor = balance.minDeckSize ?? 10;
    for (const d of startingDecks) {
      const deck = d.buildDeck ? d.buildDeck(standard()) : standard();
      expect(deck.length, d.id).toBeGreaterThanOrEqual(floor);
      for (const c of deck) expect(c, d.id).not.toHaveProperty('id');
    }
  });

  it('buildDeck est pure : il ne modifie pas les cartes reçues', () => {
    for (const d of startingDecks) {
      if (!d.buildDeck) continue;
      const input = standard();
      const before = JSON.stringify(input);
      d.buildDeck(input);
      expect(JSON.stringify(input), d.id).toBe(before);
    }
  });

  it('contenus attendus', () => {
    const rouge = byId(startingDecks, 'sabot-rouge').buildDeck!(standard());
    expect(rouge).toHaveLength(52);
    expect(rouge.every((c) => c.suit === 'hearts' || c.suit === 'diamonds')).toBe(true);
    expect(byId(startingDecks, 'sabot-court').buildDeck!(standard())).toHaveLength(40);
    const tricheur = byId(startingDecks, 'sabot-tricheur').buildDeck!(standard());
    expect(tricheur.filter((c) => c.enhancement === 'marquee').map((c) => c.rank)).toEqual(['A', 'A', 'A', 'A']);
  });
});

describe('pots-de-vin', () => {
  it('chacun agit par l’API', () => {
    for (const r of skipRewards) {
      const ctx = hookCtx({ state: makeState({ money: 5 }), rng: fakeRng([0.3]) });
      r.grant(ctx);
      expect(ctx.api.calls.length, r.id).toBeGreaterThan(0);
    }
  });

  it('les mods de table visent la table suivante', () => {
    const ctx = hookCtx();
    byId(skipRewards, 'ami-du-croupier').grant(ctx);
    expect(ctx.api.argsOf('addRuleMod')).toEqual([['table', { key: 'targetFactor', add: -0.25, source: 'ami-du-croupier' }]]);
  });

  it('Recrue ne redonne pas un atout déjà possédé', () => {
    const state = makeState({ atouts: [] });
    const ctx = hookCtx({ state, rng: fakeRng([0]) });
    byId(skipRewards, 'recrue').grant(ctx);
    const [[id]] = ctx.api.argsOf('addAtout') as [[string]];
    const again = hookCtx({ state: makeState({ atouts: [{ uid: 1, defId: id, state: {} }] }), rng: fakeRng([0]) });
    byId(skipRewards, 'recrue').grant(again);
    expect(again.api.argsOf('addAtout')[0]?.[0]).not.toBe(id);
  });
});
