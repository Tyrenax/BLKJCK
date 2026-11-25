/**
 * États de démonstration pour les captures (chargé seulement avec ?ext=… ou ?extprofile=demo) :
 * un robot joue de vraies parties avec le vrai moteur, pour remplir la frise, la meilleure main
 * et un profil réaliste. Jamais utilisé en jeu normal.
 */
import { createRng } from '../../engine/rng';
import type { Action, Engine, Rng, RunState } from '../../engine/types';
import { applyRunResult, emptyProfile, type Profile } from '../../profile';

function botAction(e: Engine, s: RunState, rng: Rng): Action {
  const ok = (a: Action) => e.whyIllegal(s, a) === null;
  switch (s.phase) {
    case 'tableIntro':
      return rng.chance(0.15) && ok({ type: 'skipTable' }) ? { type: 'skipTable' } : { type: 'startTable' };
    case 'playerTurn': {
      const r = e.getRules(s);
      const v = e.handValue(s.table!.hand!.playerCards, r.playerLimit);
      if (v.total <= 11 && ok({ type: 'double' }) && rng.chance(0.4)) return { type: 'double' };
      return v.total < r.playerLimit - 4 && ok({ type: 'hit' }) ? { type: 'hit' } : { type: 'stand' };
    }
    case 'bustChoice':
      return { type: 'acceptBust' };
    case 'handResult':
      return { type: 'nextHand' };
    case 'tableWon':
      return { type: 'cashOut' };
    case 'shop': {
      for (const o of s.shop?.offers ?? []) {
        const a: Action = { type: 'buy', offerId: o.offerId };
        if (o.kind !== 'card' && ok(a)) return a;
      }
      return { type: 'leaveShop' };
    }
    default:
      return { type: 'continueEndless' };
  }
}

/**
 * Joue une partie au robot. `carryUntil` : jusqu'à ce salon, le robot « triche » en fin de table
 * (l'objectif est atteint de justesse) pour que la partie aille loin ; au-delà, il joue honnêtement.
 */
function playRun(e: Engine, seed: string, carryUntil: number, untilVictory: boolean): RunState {
  const rng = createRng({ rngState: seed.length * 7919 + 13 });
  let s = e.newRun(seed).state;
  for (let i = 0; i < 4000 && s.phase !== 'gameOver' && s.phase !== 'victory'; i++) {
    if (s.phase === 'handResult' && s.table && s.table.handsLeft <= 0 && s.table.score < s.table.target && (untilVictory || s.salon < carryUntil)) {
      s = structuredClone(s);
      s.table!.score = Math.round(s.table!.target * (1 + rng.next() * 0.35));
    }
    s = e.dispatch(s, botAction(e, s, rng)).state;
  }
  return s;
}

export function demoEnd(e: Engine, victory: boolean): RunState {
  return playRun(e, victory ? 'NUITBLANCHE' : 'DERNIERTOUR', victory ? 99 : 4, victory);
}

export function demoProfile(e: Engine): Profile {
  let p = emptyProfile();
  for (let i = 0; i < 14; i++) {
    const s = playRun(e, `PROFIL${i}`, i % 5 === 0 ? 99 : 2 + (i % 3), i % 5 === 0);
    p = applyRunResult(p, s);
  }
  return p;
}
