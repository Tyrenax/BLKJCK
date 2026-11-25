import { describe, expect, it } from 'vitest';
import { testBalance } from '../engine/testing/content';
import { atBossTable, dealRigged, deepFreeze, makeEngine, play, startedRun } from '../engine/testing/helpers';
import type { RunState } from '../engine/types';
import {
  applyRunResult,
  deserializeProfile,
  emptyProfile,
  isStakeUnlocked,
  loadProfile,
  type Profile,
  type ProfileStorage,
  saveProfile,
  serializeProfile,
  unlockedStakeLevel,
} from './index';

const e = makeEngine();

function winTable(s: RunState): RunState {
  const dealt = dealRigged(e, s, ['AH', 'KD'], ['10C', '7D'], { score: s.table!.target - 1, handsDealt: 1 }).state;
  return play(e, dealt, [{ type: 'stand' }, { type: 'nextHand' }]).state;
}

/** Partie gagnée (victoire au dernier salon) avec ce sabot et cette mise. */
function victory(deckId = 't-rouge', stakeId = 't-blanche'): RunState {
  let s = e.dispatch(e.newRun('PROF', { deckId, stakeId }).state, { type: 'startTable' }).state;
  s = structuredClone(s);
  s.salon = testBalance.salons;
  s = atBossTable(s, 't-maison');
  const won = winTable(s);
  expect(won.phase).toBe('victory');
  return won;
}

/** Partie perdue dès la première table. */
function defeat(deckId = 't-rouge', stakeId = 't-blanche'): RunState {
  const s = e.dispatch(e.newRun('PROF', { deckId, stakeId }).state, { type: 'startTable' }).state;
  const last = dealRigged(e, s, ['10H', '7D'], ['10C', '9D'], { handsDealt: testBalance.baseRules.handsPerTable - 1 }).state;
  const dead = play(e, last, [{ type: 'stand' }, { type: 'nextHand' }]).state;
  expect(dead.phase).toBe('gameOver');
  return dead;
}

describe('profil', () => {
  it('profil vide', () => {
    const p = emptyProfile();
    expect(p).toMatchObject({ runsPlayed: 0, runsWon: 0, furthestSalon: 0, bestHand: null });
    expect(unlockedStakeLevel(p, 't-rouge')).toBe(0);
  });

  it('une victoire : jouée, gagnée, par sabot et par mise, record de main', () => {
    const won = victory();
    const p = applyRunResult(emptyProfile(), won);
    expect(p).toMatchObject({ runsPlayed: 1, runsWon: 1, furthestSalon: testBalance.salons });
    expect(p.byDeck['t-rouge']).toEqual({ played: 1, won: 1, bestStakeWon: 0 });
    expect(p.byStake['t-blanche']).toEqual({ played: 1, won: 1 });
    expect(p.bestHand).toMatchObject({ figure: 'blackjack' });
    expect(p.seen.bosses).toContain('t-maison');
    expect(p.seen.decks).toEqual(['t-rouge']);
  });

  it('une défaite compte une partie jouée, pas gagnée', () => {
    const p = applyRunResult(emptyProfile(), defeat());
    expect(p).toMatchObject({ runsPlayed: 1, runsWon: 0 });
    expect(p.byDeck['t-rouge']).toEqual({ played: 1, won: 0, bestStakeWon: -1 });
  });

  it('mode sans fin : la mort après la victoire ne compte pas une seconde partie', () => {
    const won = victory();
    let p = applyRunResult(emptyProfile(), won);
    const endless = structuredClone(e.dispatch(won, { type: 'continueEndless' }).state);
    endless.phase = 'gameOver';
    endless.salon = testBalance.salons + 2;
    p = applyRunResult(p, endless);
    expect(p).toMatchObject({ runsPlayed: 1, runsWon: 1, furthestSalon: testBalance.salons + 2 });
  });

  it('les mises se débloquent une par une, par sabot', () => {
    let p = emptyProfile();
    expect(isStakeUnlocked(p, 't-rouge', 1)).toBe(false);
    p = applyRunResult(p, victory('t-rouge', 't-blanche'));
    expect(unlockedStakeLevel(p, 't-rouge')).toBe(1);
    expect(isStakeUnlocked(p, 't-rouge', 1)).toBe(true);
    expect(isStakeUnlocked(p, 't-rouge', 2)).toBe(false);
    // Un autre sabot repart de la mise 0.
    expect(unlockedStakeLevel(p, 't-classique')).toBe(0);
    p = applyRunResult(p, victory('t-rouge', 't-rouge'));
    expect(unlockedStakeLevel(p, 't-rouge')).toBe(2);
    // Une victoire à une mise plus basse ne fait pas reculer.
    p = applyRunResult(p, victory('t-rouge', 't-blanche'));
    expect(unlockedStakeLevel(p, 't-rouge')).toBe(2);
  });

  it('une phase non terminale ne change rien ; la fonction est pure', () => {
    const p0 = deepFreeze(applyRunResult(emptyProfile(), victory()));
    expect(applyRunResult(p0, startedRun(e))).toEqual(p0);
    const won = deepFreeze(victory());
    expect(() => applyRunResult(p0, won)).not.toThrow();
  });

  it('collection : objets rencontrés et possédés', () => {
    const won = structuredClone(victory());
    won.atouts.push({ uid: 999, defId: 't-coeur', state: {} });
    const p = applyRunResult(emptyProfile(), won);
    expect(p.seen.atouts).toContain('t-coeur');
  });

  it('sérialisation : aller-retour, profil illisible, profil incomplet', () => {
    const p = applyRunResult(emptyProfile(), victory());
    expect(deserializeProfile(serializeProfile(p))).toEqual(p);
    expect(deserializeProfile('pas du json')).toEqual(emptyProfile());
    expect(deserializeProfile(null)).toEqual(emptyProfile());
    expect(deserializeProfile('{"runsPlayed": 3}')).toMatchObject({ runsPlayed: 3, runsWon: 0, byDeck: {} });
  });

  it('stockage injecté : lecture et écriture, erreurs du navigateur avalées', () => {
    let saved: string | null = null;
    const mem: ProfileStorage = { read: () => saved, write: (d) => void (saved = d) };
    const p: Profile = applyRunResult(emptyProfile(), defeat());
    expect(saveProfile(mem, p)).toBe(true);
    expect(loadProfile(mem)).toEqual(p);
    const broken: ProfileStorage = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadProfile(broken)).toEqual(emptyProfile());
    expect(saveProfile(broken, p)).toBe(false);
  });
});
