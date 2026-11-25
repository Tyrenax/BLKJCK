/**
 * Démarrage : polices, cadres, scène, fond, moteur, contrôleur.
 * Le moteur (src/engine), le contenu (src/content) et les écrans d'extension (src/ui/ext) sont
 * importés statiquement : le build les met dans le fichier final, qui s'ouvre sans serveur.
 *
 * En développement seulement (import.meta.env.DEV, absent du build) :
 *   ?dev=1&scenario=<nom>  faux moteur et scénarios (dev/scenarios.ts)
 *   ?bot=1…  ?auto=…  ?jump=…  ?screen=sheet|intro|deck|settings|launch|collection
 *   ?speed=1|2|4  ?hold=<typeEvénement>:<n>  ?ff=1 (captures sans tête)  ?seed=…
 */
import type { Action, Content, CreateEngine, Engine } from '../engine/types';
import { Smoke } from './bg/smoke';
import { onFrame, startClock } from './core/anim';
import { settings, updateSettings } from './core/settings';
import { buildStage } from './core/stage';
import { Game } from './game';
import { installFrames } from './gfx/frames';
import { initFx } from './view/fx';
import { installSymbols } from './view/tooltip';

async function loadFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load('20px "Jersey 20"'),
    document.fonts.load('48px "Jacquard 24"'),
    document.fonts.load('22px "Jersey 15"'),
  ]);
  await document.fonts.ready;
}

// imports statiques (eager) : rien n'est chargé par URL à l'exécution
const engineMods = import.meta.glob('../engine/index.ts', { eager: true });
const contentMods = import.meta.glob('../content/index.ts', { eager: true });
/** Écrans d'extension (bjck-5a) : src/ui/ext/index.ts exporte installExt(game). */
const extMods = import.meta.glob('./ext/index.ts', { eager: true });

function realEngine(): Engine | null {
  const em = engineMods['../engine/index.ts'] as { createEngine?: CreateEngine; default?: CreateEngine } | undefined;
  const cm = contentMods['../content/index.ts'] as { content?: Content; default?: Content } | undefined;
  if (!em || !cm) return null;
  try {
    const create = em.createEngine ?? em.default;
    const content = cm.content ?? cm.default;
    if (typeof create !== 'function' || !content) return null;
    return create(content);
  } catch (err) {
    console.warn('Moteur réel indisponible, faux moteur utilisé.', err);
    return null;
  }
}

export async function boot(root: HTMLElement): Promise<void> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('ff')) {
    // captures sans tête : les erreurs s'affichent dans la page
    const show = (m: string) => {
      const d = document.createElement('pre');
      d.style.cssText = 'position:fixed;left:0;bottom:0;z-index:999;color:var(--ivoire);background:var(--cerise-sombre);font:16px "Jersey 15";margin:0;max-width:100%;white-space:pre-wrap';
      d.textContent = m;
      document.body.appendChild(d);
    };
    window.addEventListener('error', (e) => show(String(e.error?.stack ?? e.message)));
    window.addEventListener('unhandledrejection', (e) => show(String((e.reason as Error)?.stack ?? e.reason)));
    const ce = console.error.bind(console);
    console.error = (...a: unknown[]) => {
      show(a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' '));
      ce(...a);
    };
  }
  await loadFonts();
  installFrames();
  installSymbols();
  const L = buildStage(root);
  initFx(L.fx);
  startClock();
  const smoke = new Smoke(L.bg);
  onFrame((_dt, real) => smoke.update(real));

  const DEV = import.meta.env.DEV;
  const params = new URLSearchParams(DEV ? location.search : '');
  const screen = params.get('screen');
  if (DEV && screen === 'sheet') {
    const { showSheet } = await import('./dev/sheet');
    showSheet(L);
    return;
  }
  const sp = params.get('speed');
  if (sp === '1' || sp === '2' || sp === '4') updateSettings({ speed: Number(sp) as 1 | 2 | 4 });
  void settings;

  const scenarioName = params.get('scenario');
  const dev = DEV && (params.has('dev') || !!scenarioName);
  let engine: Engine | null = dev ? null : realEngine();
  // le faux moteur et les scénarios n'existent qu'en développement (retirés du build)
  let scenario: { opts: object; actions: Action[] } | undefined;
  if (!engine && DEV) {
    const [{ createFakeEngine }, { fakeContent }, { SCENARIOS }] = await Promise.all([
      import('./dev/fakeEngine'),
      import('./dev/fakeContent'),
      import('./dev/scenarios'),
    ]);
    scenario = scenarioName ? SCENARIOS[scenarioName] : undefined;
    engine = createFakeEngine(fakeContent, scenario?.opts ?? {});
  }
  if (!engine) {
    root.textContent = 'Le moteur de jeu est introuvable.';
    return;
  }
  const game = new Game(L, engine, smoke);
  (window as unknown as { sabot: Game }).sabot = game;
  // en debug (faux moteur, robot, scénarios), on ne touche pas à la sauvegarde du joueur
  game.persist = !dev && !params.has('bot') && !params.has('auto') && !params.has('audit');
  game.hints.enabled = !params.has('bot') || params.has('hints');
  const ext = extMods['./ext/index.ts'] as { installExt?: (g: Game) => void | Promise<void> } | undefined;
  if (ext) {
    try {
      await ext.installExt?.(game);
    } catch (err) {
      console.warn('Écrans d’extension indisponibles.', err);
    }
  }
  if (DEV && (await devBoot(game, params, screen, scenario))) return;
  game.screens.title.show();
}

/** Chemins de debug (développement seulement). Renvoie vrai s'il en a pris un. */
async function devBoot(game: Game, params: URLSearchParams, screen: string | null, scenario: { opts: object; actions: Action[] } | undefined): Promise<boolean> {
  // ?screen=launch|collection : ouvre un écran d'extension (captures)
  // ?audit=1 : audit de mise en page (window.__audit, piloté par CDP)
  if (params.has('audit')) {
    const { installAudit } = await import('./dev/audit');
    installAudit(game);
    game.screens.title.show();
    return true;
  }
  if (screen === 'launch' || screen === 'collection') {
    game.screens.title.show();
    game.screens[screen]?.open();
    return true;
  }

  if (scenario) {
    game.autoplay = [...scenario.actions];
    await game.newRun(params.get('seed') ?? 'demo');
    const first = game.autoplay.shift();
    if (first) await game.act(first);
    const use = params.get('use');
    if (use) setTimeout(() => game.useConsumable(Number(use)), 1200);
    return true;
  }
  // ?bot=1&stop=shop:2&turbo=1 : le robot de test joue une partie à travers l'interface
  if (params.has('bot') && params.has('seeds')) {
    const { runSuite } = await import('./dev/bot');
    await runSuite(game, Number(params.get('seeds')), params.has('turbo'), Number(params.get('maxSalon') ?? 10));
    return true;
  }
  if (params.has('bot')) {
    const { runBot } = await import('./dev/bot');
    const jump = params.get('jump');
    const js = jump ? (await import('./dev/jump')).jumpState(game, jump, params.get('seed') ?? 'demo') : null;
    if (js) game.load(js);
    else await game.newRun(params.get('seed') ?? 'demo');
    await runBot(game, params.get('stop'), params.has('turbo'));
    if (screen === 'deck') game.openDeck();
    if (screen === 'carnet') game.screens.carnet.open();
    return true;
  }
  // ?auto=startTable,hit,stand : actions simples jouées toutes seules (marche aussi avec le vrai moteur)
  const auto = params.get('auto');
  if (auto) {
    game.autoplay = auto.split(',').map((t) => ({ type: t.trim() }) as Action);
    await game.newRun(params.get('seed') ?? 'demo');
    const first = game.autoplay.shift();
    if (first) await game.act(first);
    return true;
  }
  if (screen === 'intro') {
    await game.newRun(params.get('seed') ?? 'demo');
    return true;
  }
  if (screen === 'deck') {
    game.autoplay = [];
    await game.newRun(params.get('seed') ?? 'demo');
    await game.act({ type: 'startTable' });
    game.openDeck();
    return true;
  }
  if (screen === 'settings') {
    game.screens.title.show();
    game.screens.settings.open();
    return true;
  }
  return false;
}
