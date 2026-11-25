import type { ConsumableDef } from '../../engine/types';
import { workshopCombines } from './atelier';
import { tacticalCombines } from './combines';
import { faveurs } from './faveurs';

export { tacticalCombines, workshopCombines, faveurs };
export { FAVEUR_FIGURE } from './faveurs';

export const combines: ConsumableDef[] = [...tacticalCombines, ...workshopCombines];
export const consumables: ConsumableDef[] = [...combines, ...faveurs];
