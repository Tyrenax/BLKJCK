/**
 * Raccourcis de test vers des états tardifs du vrai moteur (dev seulement) :
 * ?jump=victory  table du patron du dernier salon, objectif ramené à 1.
 */
import type { RunState } from '../../engine/types';
import type { Game } from '../game';

export function jumpState(game: Game, kind: string, seed: string): RunState | null {
  const eng = game.engine;
  const B = eng.content.balance;
  let s = structuredClone(eng.newRun(seed).state);
  if (kind === 'victory') {
    const finale = eng.content.bosses.find((b) => b.finale) ?? eng.content.bosses[0];
    s.salon = B.salons;
    s.tableIndex = 2;
    s.bossId = finale.id;
    if (s.table) {
      s.table.kind = 'patron';
      s.table.bossId = finale.id;
    }
    s = structuredClone(eng.dispatch(s, { type: 'startTable' }).state);
    if (s.table) s.table.target = 1;
    return s;
  }
  if (kind === 'reshuffle') {
    // sabot réduit à 7 cartes : il se vide dès la deuxième ou troisième main et la défausse y retourne
    s.deck = s.deck.slice(0, 7);
    s = structuredClone(eng.dispatch(s, { type: 'startTable' }).state);
    if (s.table) s.table.target = 99999;
    return s;
  }
  return null;
}
