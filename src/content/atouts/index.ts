import type { AtoutDef } from '../../engine/types';
import { argentAtouts } from './argent';
import { croissanceAtouts } from './croissance';
import { croupierAtouts } from './croupier';
import { enseignesAtouts } from './enseignes';
import { legendairesAtouts } from './legendaires';
import { limiteAtouts } from './limite';
import { petitesAtouts } from './petites';
import { risqueAtouts } from './risque';
import { sabotAtouts } from './sabot';
import { tetesAtouts } from './tetes';

/** Axes de synergie (DESIGN §5). Sert au simulateur pour forcer un build et comparer les familles. */
export type AtoutFamily =
  | 'limite'
  | 'croupier'
  | 'enseignes'
  | 'tetes'
  | 'petites'
  | 'risque'
  | 'croissance'
  | 'argent'
  | 'sabot'
  | 'legendaire';

export const ATOUTS_BY_FAMILY: Record<AtoutFamily, AtoutDef[]> = {
  limite: limiteAtouts,
  croupier: croupierAtouts,
  enseignes: enseignesAtouts,
  tetes: tetesAtouts,
  petites: petitesAtouts,
  risque: risqueAtouts,
  croissance: croissanceAtouts,
  argent: argentAtouts,
  sabot: sabotAtouts,
  legendaire: legendairesAtouts,
};

export const atouts: AtoutDef[] = Object.values(ATOUTS_BY_FAMILY).flat();

/** id d'atout -> famille. */
export const ATOUT_FAMILY: Record<string, AtoutFamily> = Object.fromEntries(
  (Object.entries(ATOUTS_BY_FAMILY) as [AtoutFamily, AtoutDef[]][]).flatMap(([fam, defs]) =>
    defs.map((d) => [d.id, fam] as const),
  ),
);
