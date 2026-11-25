/**
 * SABOT — simulateur d'équilibrage.
 *
 *   npm run sim -- [options]
 *
 *   --bot naive|basic|smart|all   robot (défaut basic ; all = les trois)
 *   --runs N                      parties par robot (défaut 1000 ; le malin plafonne à --smart-runs)
 *   --smart-runs N                parties pour le robot malin (défaut 200)
 *   --rollouts K                  tables d'essai par option pour le malin (défaut 6)
 *   --seed S                      graine de base (partie i = S-i)
 *   --no-buy                      le robot n'achète rien (référence sans atout)
 *   --family F                    n'achète que des atouts de cette famille
 *   --families                    compare les familles : kit de 3 atouts au départ, achats dans la famille
 *   --rules k=v,k=v               change balance.baseRules (ex. handsPerTable=5,lossMultKeep=0.25)
 *   --targets X                   multiplie tous les objectifs
 *   --salons N                    arrête chaque partie après le salon N
 *   --exp NOM                     chance | limite | defausse | base | calage | marginal
 */
import { ATOUT_FAMILY, ATOUTS_BY_FAMILY, content, type AtoutFamily } from '../src/content/index';
import { existsSync, readFileSync } from 'node:fs';
import type { AtoutDef, BaseRules, Content, TableKind } from '../src/engine/types';
import { makeBot, setFamilyMap, type BotName, type BotOptions } from './sim/bots';
import { parseRules, simEngine, variantContent, type Variant } from './sim/engine';
import { pct, report, summarize, summaryLine } from './sim/report';
import { runBatch } from './sim/batch';
import { candidates } from './sim/candidates';
import {
  basicMeanSalon,
  calibrateQ,
  calibrateS1,
  calibrateSalons,
  contentWith,
  nice,
  smartWinRate,
  targetsFrom,
} from './sim/calibrate';
import { mean } from './sim/report';
import type { RunRecord } from './sim/runner';
import { SIM, type DiscardPolicy } from './sim/strategy';

/** Pas de @types/node dans le projet : juste ce qu'il faut de `process`. */
declare const process: { argv: string[] };

interface Args {
  bot: string;
  runs: number;
  smartRuns: number;
  rollouts: number;
  seed: string;
  noBuy: boolean;
  family?: AtoutFamily;
  families: boolean;
  rules?: string;
  targets: number;
  salons?: number;
  exp?: string;
  /** Cibles du salon 1 sans achat pour --exp calage, en % : « 85,70,55 ». */
  s1?: string;
  /** Liste d'atouts à mesurer pour --exp marginal (défaut : tous + candidats). */
  atouts?: string;
  /** Fichier de reprise du calage salon par salon. */
  resume?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { bot: 'basic', runs: 1000, smartRuns: 200, rollouts: 6, seed: 'sabot', noBuy: false, families: false, targets: 1 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i] ?? '';
    switch (k) {
      case '--bot': a.bot = v(); break;
      case '--runs': a.runs = Number(v()); break;
      case '--smart-runs': a.smartRuns = Number(v()); break;
      case '--rollouts': a.rollouts = Number(v()); break;
      case '--seed': a.seed = v(); break;
      case '--no-buy': a.noBuy = true; break;
      case '--family': a.family = v() as AtoutFamily; break;
      case '--families': a.families = true; break;
      case '--rules': a.rules = v(); break;
      case '--targets': a.targets = Number(v()); break;
      case '--salons': a.salons = Number(v()); break;
      case '--exp': a.exp = v(); break;
      case '--s1': a.s1 = v(); break;
      case '--atouts': a.atouts = v(); break;
      case '--resume': a.resume = v(); break;
      default: throw new Error(`option inconnue : ${k}`);
    }
  }
  return a;
}

/** Kits de départ par famille : trois atouts qui font le build (comparaison des plafonds). */
const KITS: Record<AtoutFamily, string[]> = {
  limite: ['marge-de-manoeuvre', 'altitude', 'sur-le-fil'],
  croupier: ['croupier-fatigue', 'casse-banque', 'vampire'],
  enseignes: ['sang-chaud', 'monochrome', 'rouge-ou-noir'],
  tetes: ['cour-royale', 'gros-calibre', 'haute-societe'],
  petites: ['menu-fretin', 'mille-pattes', 'quatre-a-quatre'],
  risque: ['tete-brulee', 'tapis', 'dix-de-der'],
  croissance: ['boule-de-neige', 'vieux-de-la-vieille', 'collectionneur'],
  argent: ['flambeur', 'tirelire', 'pourboire'],
  sabot: ['sabot-leger', 'carte-maitresse', 'poids-plume'],
  legendaire: ['le-parrain', 'l-ambidextre'],
};

/** Échelle d'objectifs qui donne `goal` de réussite au salon 1 (robot de base, recherche dichotomique). */
function calibrate(base: Content, v: Variant, goal: number, runs: number, seed: string): number {
  let lo = 0.2;
  let hi = 6;
  for (let it = 0; it < 9; it++) {
    const mid = Math.sqrt(lo * hi);
    const c = variantContent(base, { ...v, targetScale: mid });
    const { runs: rs } = runBatch(c, 'basic', {}, runs, `${seed}-cal`, 1);
    const clear = rs.filter((r) => r.salonReached > 1).length / rs.length;
    if (clear > goal) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

function expChance(a: Args): void {
  const variants: Variant[] = [
    { label: 'A référence' },
    { label: 'B 5 mains', rules: { handsPerTable: 5 } },
    { label: 'C défaite ×0,25', rules: { lossMultKeep: 0.25 } },
    { label: 'D égalité ×1', rules: { pushMultKeep: 1 } },
    { label: 'E 3 défausses', rules: { discardsPerTable: 3 } },
    { label: 'F 5 mains + ×0,25', rules: { handsPerTable: 5, lossMultKeep: 0.25 } },
  ];
  const calRuns = Math.max(300, Math.floor(a.runs / 2));
  const ref = runBatch(content, 'basic', {}, calRuns, `${a.seed}-cal`, 1).runs;
  const goal = ref.filter((r) => r.salonReached > 1).length / ref.length;
  console.log(`Expérience « part de chance » — robot de base, objectifs recalés pour passer le salon 1 dans ${pct(goal, 1)} des cas.`);
  for (const v of variants) {
    const scale = v.rules ? calibrate(content, v, goal, calRuns, a.seed) : 1;
    const c = variantContent(content, { ...v, targetScale: scale });
    for (const bot of ['naive', 'basic'] as BotName[]) {
      const { runs } = runBatch(c, bot, { noBuy: a.noBuy }, a.runs, a.seed, a.salons);
      const s = summarize(runs);
      const tables = runs.flatMap((r) => r.tables).filter((t) => t.hands > 0);
      const dist = [0, 1, 2, 3, 4]
        .map((w) => pct(tables.filter((t) => (w === 4 ? t.wins >= 4 : t.wins === w)).length, tables.length))
        .join('/');
      console.log(`${summaryLine(`${v.label} ×${scale.toFixed(2)} ${bot}`, s)} · victoires/table ${dist}`);
    }
  }
}

function expDefausse(a: Args): void {
  console.log('Défausse préventive (règle G : pas de défausse après crevé) — robot de base sans achat, salon 1.');
  for (const policy of ['none', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as DiscardPolicy[]) {
    SIM.discardPolicy = policy;
    const { runs } = runBatch(content, 'basic', { noBuy: true }, a.runs, a.seed, 1);
    console.log(summaryLine(`politique ${policy}`, summarize(runs)));
  }
  SIM.discardPolicy = 'p5';
}

/** Variantes de base sous la règle « pas de défausse après crevé », recalées à iso-difficulté. */
/** Calage des objectifs : affiche salonBaseTargets et tableFactors à recopier dans balance. */
function expCalage(a: Args, base: Content): void {
  const log = (s: string) => console.log(s);
  log(`1/3 — salon 1 sans achat (cibles ${a.s1 ?? '85,70,55'} %)`);
  const [petite = 0.85, grande = 0.7, patron = 0.55] = (a.s1 ?? '85,70,55').split(',').map((x) => Number(x) / 100);
  const s1 = calibrateS1(base, { petite, grande, patron }, a.runs, a.seed, log);
  const t1 = nice(s1.t1);
  log(`  → base ${t1}, facteurs ${JSON.stringify(s1.factors)}`);
  log('2/3 — croissance géométrique : le robot malin gagne ~22 % des parties');
  const smart = (c: Content) => smartWinRate(c, a.smartRuns, a.rollouts, `${a.seed}-q`);
  const q = calibrateQ(base, t1, s1.factors, smart, 0.22, log);
  log('3/3 — avec ces objectifs, où meurt le robot de base ?');
  log(`  salon moyen ${basicMeanSalon(contentWith(base, t1, q, s1.factors), a.runs, a.seed).toFixed(2)} (cible 4–5)`);
  log(`salonBaseTargets: [${targetsFrom(t1, q, 1, base.balance.salons).join(', ')}],`);
  log(`tableFactors: ${JSON.stringify(s1.factors)},`);
}

/** Le Borgne : sa difficulté vient-elle du patron ou du robot qui suppose un 7 pour la carte cachée ? */
function expBorgne(a: Args, base: Content): void {
  const hidden = variantContent(base, { label: 'borgne', rules: { hidePlayerFirstCard: true } });
  const line = (label: string, c: Content) =>
    console.log(summaryLine(label, summarize(runBatch(c, 'basic', { noBuy: true }, a.runs, a.seed, 1).runs)));
  console.log('Le Borgne sur tout le salon 1 — robot de base sans achat.');
  line('sans Le Borgne', base);
  for (const rank of ['5', '7', '10'] as const) {
    SIM.hiddenAssume = rank;
    line(`Le Borgne, carte supposée ${rank}`, hidden);
  }
  SIM.hiddenAssume = '7';
  SIM.seeHiddenCard = true;
  line('Le Borgne, robot qui triche', hidden);
  SIM.seeHiddenCard = false;
}

/** Calage salon par salon sur la survie du malin (90 % par salon, 50 % au salon 8). */
function expCalageSalons(a: Args, base: Content): void {
  const log = (s: string) => console.log(s);
  const [petite = 0.95, grande = 0.85, patron = 0.75] = (a.s1 ?? '95,85,75').split(',').map((x) => Number(x) / 100);
  // Reprise : le fichier garde la base, les facteurs et les salons déjà calés.
  const saved =
    a.resume && existsSync(a.resume)
      ? (JSON.parse(readFileSync(a.resume, 'utf8')) as { t1: number; factors: Record<TableKind, number> })
      : null;
  let s1: { t1: number; factors: Record<TableKind, number> };
  if (saved) {
    s1 = saved;
    log(`1/2 — salon 1 repris du fichier : base ${saved.t1}, facteurs ${JSON.stringify(saved.factors)}`);
  } else {
    log(`1/2 — salon 1 sans achat (cibles ${a.s1 ?? '95,85,75'} %)`);
    s1 = calibrateS1(base, { petite, grande, patron }, a.runs, a.seed, log);
  }
  const t1 = nice(s1.t1);
  log(`  → base ${t1}, facteurs ${JSON.stringify(s1.factors)}`);
  log('2/2 — salons 2 à 8 : 90 % de passage du malin par salon, 50 % au salon 8');
  const goals = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.5];
  const targets = calibrateSalons(base, t1, s1.factors, goals, a.smartRuns, a.rollouts, a.seed, log, 1.4, 2.2, a.resume);
  log(`salonBaseTargets: [${targets.join(', ')}],`);
  log(`tableFactors: ${JSON.stringify(s1.factors)},`);
}

/** Valeur marginale : chaque atout seul au départ, robot de base sans achat, mêmes graines. */
function expMarginal(a: Args, base: Content): void {
  // Deux étalons fictifs (bjck-41) : un atout commun vaut « +4 Mult » ou « +30 Jetons » sans condition.
  const etalons: AtoutDef[] = [
    { id: 'etalon-4-mult', name: 'Étalon +4 Mult', description: '+4 Mult.', rarity: 'commun', cost: 5,
      art: { glyph: 'E4', pattern: 'uni', colors: ['nuit', 'cendre'] }, hooks: { onHandScored: () => ({ mult: 4 }) } },
    { id: 'etalon-30-jetons', name: 'Étalon +30 Jetons', description: '+30 Jetons.', rarity: 'commun', cost: 5,
      art: { glyph: 'E30', pattern: 'uni', colors: ['nuit', 'cendre'] }, hooks: { onHandScored: () => ({ chips: 30 }) } },
  ];
  const c: Content = { ...base, atouts: [...base.atouts, ...etalons, ...candidates] };
  // Le robot achète tout sauf des atouts : l'argent et la Déchiqueteuse servent, l'atout testé reste seul.
  const opts = { noAtoutBuy: true };
  const tables = (rs: RunRecord[]) => mean(rs.map((r) => r.tablesWon));
  const ref = tables(runBatch(c, 'basic', opts, a.runs, a.seed).runs);
  console.log(`Référence sans atout : ${ref.toFixed(2)} tables gagnées (${a.runs} parties, robot de base sans achat d'atout).`);
  const gainOf = (id: string) => tables(runBatch(c, 'basic', opts, a.runs, a.seed, undefined, [id]).runs) - ref;
  for (const e of etalons) console.log(`  étalon ${e.name} : +${gainOf(e.id).toFixed(2)} table`);
  const only = a.atouts?.split(',');
  const tested = [...base.atouts, ...candidates].filter((d) => !only || only.includes(d.id));
  const rows = tested.map((d) => ({ d, gain: gainOf(d.id) }));
  for (const rarity of ['commun', 'peu-commun', 'rare', 'legendaire']) {
    const rs = rows.filter((r) => r.d.rarity === rarity).sort((x, y) => y.gain - x.gain);
    if (!rs.length) continue;
    const med = rs[Math.floor(rs.length / 2)]!.gain;
    console.log(`\n${rarity} (médiane +${med.toFixed(2)} table)`);
    for (const { d, gain } of rs) {
      const flag = gain < med / 2 ? '  ▼' : gain > med * 2 ? '  ▲' : '';
      console.log(`  ${d.id.padEnd(26)} ${gain >= 0 ? '+' : ''}${gain.toFixed(2)}  ${d.cost} $${flag}`);
    }
  }
}

function expBase(a: Args): void {
  const variants: Variant[] = [
    { label: 'G 4 mains 2 déf.', rules: { handsPerTable: 4, discardsPerTable: 2 } },
    { label: 'H 5 mains 2 déf.', rules: { handsPerTable: 5, discardsPerTable: 2 } },
    { label: 'I 5 mains 3 déf.', rules: { handsPerTable: 5, discardsPerTable: 3 } },
  ];
  const goal = 0.5;
  const calRuns = Math.max(400, Math.floor(a.runs / 2));
  console.log(`Base du jeu — robot de base, objectifs recalés pour passer le salon 1 dans ${pct(goal, 1)} des cas.`);
  for (const v of variants) {
    const scale = calibrate(content, v, goal, calRuns, a.seed);
    const c = variantContent(content, { ...v, targetScale: scale });
    const { runs } = runBatch(c, 'basic', {}, a.runs, a.seed, a.salons);
    console.log(summaryLine(`${v.label} ×${scale.toFixed(2)}`, summarize(runs)));
  }
}

function expLimite(a: Args): void {
  console.log('Valeur d’un point de limite — robot de base sans achat, stratégie recalée sur la limite.');
  for (const limit of [21, 22, 23, 24, 25]) {
    const c = variantContent(content, { label: `limite ${limit}`, rules: { playerLimit: limit } as Partial<BaseRules> });
    const { runs } = runBatch(c, 'basic', { noBuy: true }, a.runs, a.seed, a.salons ?? 2);
    console.log(summaryLine(`limite ${limit}`, summarize(runs)));
  }
}

function expFamilies(a: Args, base: Content): void {
  const bot = (a.bot === 'basic' || a.bot === 'naive' ? a.bot : 'smart') as BotName;
  const runs = bot === 'smart' ? a.smartRuns : a.runs;
  console.log(`Familles de build — robot ${bot}, ${runs} parties par famille, n'achète que les atouts de la famille.`);
  const rows: { fam: string; salon: number; line: string }[] = [];
  console.log(`Chaque famille démarre avec son kit (${Object.entries(KITS).map(([f, k]) => `${f}: ${k.join('+')}`).join(' · ')}).`);
  for (const fam of Object.keys(ATOUTS_BY_FAMILY) as AtoutFamily[]) {
    const { runs: rs } = runBatch(base, bot, { family: fam, rollouts: a.rollouts }, runs, a.seed, a.salons, KITS[fam]);
    const s = summarize(rs);
    rows.push({ fam, salon: s.salonMean, line: summaryLine(fam, s) });
  }
  const best = Math.max(...rows.map((r) => r.salon));
  for (const r of rows.sort((x, y) => y.salon - x.salon)) {
    console.log(`${r.line}${r.salon < best / 2 ? '  ⚠ moins de la moitié du meilleur' : ''}`);
  }
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  setFamilyMap(ATOUT_FAMILY);
  const base = variantContent(content, { label: 'cli', rules: parseRules(a.rules), targetScale: a.targets });
  if (a.exp === 'chance') return expChance(a);
  if (a.exp === 'limite') return expLimite(a);
  if (a.exp === 'defausse') return expDefausse(a);
  if (a.exp === 'base') return expBase(a);
  if (a.exp === 'calage') return expCalage(a, base);
  if (a.exp === 'calage-salons') return expCalageSalons(a, base);
  if (a.exp === 'borgne') return expBorgne(a, base);
  if (a.exp === 'marginal') return expMarginal(a, base);
  if (a.families) return expFamilies(a, base);
  const bots: BotName[] = a.bot === 'all' ? ['naive', 'basic', 'smart'] : [a.bot as BotName];
  for (const bot of bots) {
    const n = bot === 'smart' ? Math.min(a.runs, a.smartRuns) : a.runs;
    const opts: BotOptions = { noBuy: a.noBuy, family: a.family, rollouts: a.rollouts };
    const { runs, ms } = runBatch(base, bot, opts, n, a.seed, a.salons);
    const label = [`robot ${bot}`, a.noBuy ? 'sans achat' : '', a.family ? `famille ${a.family}` : '', a.rules ? `règles ${a.rules}` : '', a.targets !== 1 ? `objectifs ×${a.targets}` : '']
      .filter(Boolean)
      .join(' · ');
    console.log(report(runs, { label, ms, families: ATOUT_FAMILY }));
    console.log();
  }
}

main();
