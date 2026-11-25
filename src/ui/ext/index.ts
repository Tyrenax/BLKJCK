/**
 * Écrans d'extension (bjck-5a), branchés sur le Game de bjck-d4 :
 *  - fin de partie et victoire complètes (remplace screens/end.ts) ;
 *  - lancement d'une partie (sabot de départ, mise, graine) ;
 *  - collection et profil.
 *
 * Debug (captures) : ?ext=over | ?ext=victory  — une vraie partie jouée au robot, écran de fin ;
 *                    ?extprofile=demo          — profil de démonstration (jamais enregistré) ;
 *                    ?extdecks=demo            — sabots et mises de test dans l'écran de lancement ;
 *                    ?exttab=records           — onglet de la collection ouvert d'emblée.
 */
import './ext.css';
import type { Game } from '../game';
import { CollectionScreen } from './collection';
import { RunEndScreen } from './end';
import { LaunchScreen } from './launch';
import { setDemoProfile } from './profileStore';

export async function installExt(game: Game): Promise<void> {
  const end = new RunEndScreen(game.L.screens, game);
  const launch = new LaunchScreen(game.L.screens, game);
  const collection = new CollectionScreen(game.L.screens, game);
  game.screens.end = end;
  game.screens.launch = launch;
  game.screens.collection = collection;

  // Paramètres de démonstration : seulement en développement. import.meta.env.DEV vaut false au
  // build, donc tout ce bloc (et les modules de démo qu'il importe) disparaît du livrable.
  if (import.meta.env.DEV) await installDemo(game, launch, collection);
}

async function installDemo(game: Game, launch: LaunchScreen, collection: CollectionScreen): Promise<void> {
  const params = new URLSearchParams(location.search);
  const ext = params.get('ext');
  if (params.get('extprofile') === 'demo' || ext) {
    const demo = await import('./demo');
    setDemoProfile(demo.demoProfile(game.engine));
  }
  const tab = params.get('exttab');
  if (tab) collection.showTab(tab);
  if (params.get('extdecks') === 'demo') {
    const t = await import('../../engine/testing/content');
    launch.decksOverride = t.testStartingDecks;
    launch.stakesOverride = t.testStakes;
  }
  if (ext === 'over' || ext === 'victory') {
    const demo = await import('./demo');
    const s = demo.demoEnd(game.engine, ext === 'victory');
    // après la fin du démarrage (qui ouvre l'écran titre), on montre la fin de cette partie
    setTimeout(() => {
      game.screens.title.hide();
      game.state = s;
      game.showTable(true);
      game.syncAll(s, true);
      game.render();
    }, 0);
  }
}
