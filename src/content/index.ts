import type { Content } from '../engine/types';
import { atouts } from './atouts';
import { balance } from './balance';
import { bosses } from './bosses';
import { consumables } from './consumables';
import { enhancements } from './enhancements';
import { figures } from './figures';
import { privileges } from './privileges';
import { skipRewards } from './skips';
import { startingDecks } from './decks';
import { stakes } from './stakes';

/** Tout le contenu de SABOT, injecté dans createEngine(content). */
export const content: Content = {
  figures,
  enhancements,
  atouts,
  consumables,
  privileges,
  bosses,
  balance,
  startingDecks,
  skipRewards,
  stakes,
};

export { ATOUT_FAMILY, ATOUTS_BY_FAMILY } from './atouts';
export type { AtoutFamily } from './atouts';
export { FAVEUR_FIGURE } from './consumables';
export default content;
