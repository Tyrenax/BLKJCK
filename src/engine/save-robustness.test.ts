/**
 * Sauvegardes abîmées : contenu qui a changé depuis (objets disparus, mises réordonnées, clés de
 * règle supprimées), champs manquants, valeurs corrompues. Rien ne doit planter.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { makeTestContent, testStakes } from './testing/content';
import { dealRigged, makeEngine, play, startedRun, withAtouts, withConsumables } from './testing/helpers';
import type { RunState } from './types';

const e = makeEngine();
const json = (s: RunState): string => JSON.stringify(s);
const roundTrip = (s: RunState): RunState | null => e.deserialize(json(s));

/** Une boutique bien remplie, pour avoir de tout dans la sauvegarde. */
function richShop(): RunState {
  const s0 = withConsumables(withAtouts(startedRun(e, 'RICH'), 't-coeur', 't-boule'), 't-elastique');
  const dealt = dealRigged(e, s0, ['10H', '9S'], ['10C', '7D'], { score: s0.table!.target - 1, handsDealt: 1 }).state;
  return play(e, dealt, [{ type: 'stand' }, { type: 'nextHand' }, { type: 'cashOut' }]).state;
}

describe('sauvegardes et contenu qui change', () => {
  it('un atout, une combine, un privilège disparus du contenu sont retirés, le reste est gardé', () => {
    const s = structuredClone(richShop());
    s.atouts.push({ uid: 900, defId: 'atout-supprime', state: { x: 1 } });
    s.consumables.push({ uid: 901, defId: 'combine-supprimee' });
    s.privileges.push('privilege-supprime', 't-main');
    const back = roundTrip(s)!;
    expect(back.atouts.map((a) => a.defId)).toEqual(['t-coeur', 't-boule']);
    expect(back.consumables.map((c) => c.defId)).toEqual(['t-elastique']);
    expect(back.privileges).toEqual(['t-main']);
    expect(() => e.dispatch(back, { type: 'leaveShop' })).not.toThrow();
  });

  it('le patron de la table a disparu : la table continue sans patron', () => {
    const s = structuredClone(startedRun(e, 'BOSSGONE'));
    s.bossId = 'patron-supprime';
    s.table!.kind = 'patron';
    s.table!.bossId = 'patron-supprime';
    s.bossHistory = ['patron-supprime', 't-mur'];
    const back = roundTrip(s)!;
    expect(back.table!.bossId).toBeNull();
    expect(back.bossId).toBe('');
    expect(back.bossHistory).toEqual(['t-mur']);
    expect(() => e.dispatch(back, { type: 'stand' })).not.toThrow();
  });

  it('mises : une mise disparue est retirée, une mise déplacée retrouve son rang', () => {
    const s = structuredClone(e.newRun('STAKES', { stakeId: 't-noire' }).state);
    expect(s.stakeLevel).toBe(2);
    // Le contenu a réordonné ses mises : la noire est maintenant au rang 0.
    const reordered = makeEngine(makeTestContent({ stakes: [testStakes[2], testStakes[0], testStakes[1]] }));
    expect(reordered.deserialize(json(s))).toMatchObject({ stakeId: 't-noire', stakeLevel: 0 });
    // Le contenu n'a plus de mises du tout.
    const none = makeEngine(makeTestContent({ stakes: undefined })).deserialize(json(s))!;
    expect(none.stakeId).toBeUndefined();
    expect(none.stakeLevel).toBeUndefined();
  });

  it('offres de boutique inconnues retirées ; privilège et pots-de-vin du salon inconnus oubliés', () => {
    const s = structuredClone(richShop());
    s.shop!.offers.push({ offerId: 950, kind: 'atout', defId: 'atout-supprime', cost: 5, sold: false });
    s.salonPrivilege = 'privilege-supprime';
    s.salonSkipRewards = ['pot-supprime', 't-enveloppe'];
    const back = roundTrip(s)!;
    expect(back.shop!.offers.some((o) => o.defId === 'atout-supprime')).toBe(false);
    expect(back.salonPrivilege).toBeNull();
    expect(back.salonSkipRewards).toEqual([null, 't-enveloppe']);
  });

  it('modificateurs de règle inconnus ou mal typés retirés', () => {
    const s = structuredClone(startedRun(e, 'MODS'));
    s.runMods.push(
      { key: 'regleSupprimee', add: 1, source: 'x' } as never,
      { key: 'playerLimit', add: 'deux', source: 'x' } as never,
      { key: 'canDouble', set: 3, source: 'x' } as never,
      { key: 'playerLimit', add: 1, source: 'ok' },
    );
    const back = roundTrip(s)!;
    expect(back.runMods).toEqual([{ key: 'playerLimit', add: 1, source: 'ok' }]);
    expect(e.getRules(back).playerLimit).toBe(22);
  });

  it('cartes : amélioration inconnue retirée ; rang inconnu = partie injouable', () => {
    const s = structuredClone(startedRun(e, 'CARDS'));
    const id = s.deck[0].id;
    for (const list of [s.deck, s.table!.drawPile, s.table!.discardPile, s.table!.hand!.playerCards]) {
      for (const c of list) if (c.id === id) (c as { enhancement?: string }).enhancement = 'paillettes';
    }
    const back = roundTrip(s)!;
    expect(back.deck.find((c) => c.id === id)!.enhancement).toBeUndefined();
    const broken = structuredClone(s);
    (broken.deck[1] as { rank: string }).rank = 'Z';
    expect(roundTrip(broken)).toBeNull();
  });

  it('niveaux de figure manquants ou absurdes, compteurs d’atout non numériques', () => {
    const s = structuredClone(withAtouts(startedRun(e, 'LEVELS'), 't-boule'));
    s.figureLevels = { paire: 3, haute: -2, inconnue: 9 } as never;
    s.atouts[0].state = { mult: 'beaucoup', ok: 2 } as never;
    const back = roundTrip(s)!;
    expect(back.figureLevels).toMatchObject({ paire: 3, haute: 1, blackjack: 1 });
    expect(Object.keys(back.figureLevels)).toHaveLength(8);
    expect(back.atouts[0].state).toEqual({ ok: 2 });
  });

  it('compteurs d’identifiants en retard : remis au-dessus des ids existants', () => {
    const s = structuredClone(richShop());
    s.nextCardId = 1;
    s.nextUid = 1;
    const back = roundTrip(s)!;
    const maxCard = Math.max(...back.deck.map((c) => c.id), ...back.shop!.offers.map((o) => o.card?.id ?? 0));
    expect(back.nextCardId).toBeGreaterThan(maxCard);
    expect(back.nextUid).toBeGreaterThan(Math.max(...back.atouts.map((a) => a.uid), ...back.shop!.offers.map((o) => o.offerId)));
  });

  it('JSON illisible, forme fausse, version inconnue : null, jamais d’exception', () => {
    for (const bad of ['', '{', 'null', '[]', '42', '{"version":1}', JSON.stringify({ ...startedRun(e), version: 99 })]) {
      expect(() => e.deserialize(bad)).not.toThrow();
      expect(e.deserialize(bad)).toBeNull();
    }
  });

  it('corruptions au hasard : deserialize ne lève jamais, et ce qu’il rend reste jouable', () => {
    const rng = createRng({ rngState: 2024 });
    const sources = [startedRun(e, 'C1'), richShop(), e.newRun('C3').state];
    const junk: unknown[] = [null, undefined, 'x', -1, 1e9, NaN, [], {}, true, 'atout-supprime'];
    let playable = 0;
    for (let i = 0; i < 600; i++) {
      const s = structuredClone(rng.pick(sources)) as unknown as Record<string, unknown>;
      // descend au hasard dans l'objet et abîme une valeur
      let node: Record<string, unknown> = s;
      for (let depth = 0; depth < 4; depth++) {
        const keys = Object.keys(node);
        if (!keys.length) break;
        const k = rng.pick(keys);
        const v = node[k];
        if (depth < 3 && v && typeof v === 'object' && rng.chance(0.6)) {
          node = v as Record<string, unknown>;
          continue;
        }
        if (rng.chance(0.3)) delete node[k];
        else node[k] = rng.pick(junk);
        break;
      }
      let back: RunState | null = null;
      expect(() => (back = e.deserialize(JSON.stringify(s)))).not.toThrow();
      if (back) {
        playable++;
        const st = back as RunState;
        const acts = e.enumerateActions(st);
        if (st.phase !== 'gameOver') expect(acts.length).toBeGreaterThan(0);
        if (acts.length) expect(() => e.dispatch(st, acts[0])).not.toThrow();
      }
    }
    expect(playable).toBeGreaterThan(200);
  });
});
