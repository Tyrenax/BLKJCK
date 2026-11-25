# SABOT — game design

Roguelike de blackjack. On bat des tables de plus en plus dures en marquant des points
(Jetons × Mult), on triche de mieux en mieux entre deux tables. Web, hors-ligne, sans serveur.

Documents liés :
- `src/engine/types.ts` — le contrat de données entre les trois modules. **À lire en entier.**
- `.claude/skills/sabot-da/SKILL.md` — la direction artistique. À lire avant tout travail visible.

## 1. La partie

- Une partie = **8 salons**. Chaque salon = 3 tables : petite table, grande table, table du patron.
- Chaque table a un **objectif** de score à atteindre en **4 mains**. Atteint : on encaisse et on
  passe à la boutique. Raté après la dernière main : partie terminée.
- Le patron du salon est connu dès la petite table, pour préparer sa parade.
- Battre le patron du salon 8 = victoire.

## 2. Une main

1. Tu reçois 2 cartes de **ton sabot** (ton deck de 52 cartes, que tu modifies au fil de la partie).
   Le croupier reçoit 2 cartes de **son propre sabot** (52 cartes standard), une visible, une cachée.
2. À ton tour :
   - **Tirer** : une carte de plus.
   - **Rester** : tu t'arrêtes, le croupier joue.
   - **Doubler** (seulement avec 2 cartes) : une seule carte de plus, puis tu restes ; ton Mult est ×2.
   - **Défausser** (2 par table) : tu retires une carte de ta main, sans la remplacer.
     On défausse *avant* de crever, pour sculpter sa main ; une défausse n'annule pas un crevé
     (sauf atout Harnais, `rules.discardAfterBust`). Décidé après la simulation n°1 : utilisée
     comme annulation, la défausse supprimait tout risque (2 % de crevés, 61 % de mains gagnées).
   - Jouer une **combine**.
3. Si ton total dépasse la **limite** (21 au départ), tu **crèves**. S'il te reste une combine
   jouable ou un atout qui sauve, tu as une dernière chance (phase `bustChoice`) ;
   sinon la main marque 0.
4. Le croupier retourne sa carte et tire tant que son total est sous son **seuil** (17).
   Au-delà de sa limite (21), il crève.
5. La main est marquée (voir §3) et s'ajoute au score de la table.

Qui gagne : le total le plus haut ; à total égal, un Blackjack naturel bat une main qui n'en
est pas un. Un total au-dessus de 21 (limite relevée) bat donc toujours le croupier : c'est
voulu, et encadré par le prix des atouts de limite et par `balance.maxPlayerLimit` (23).

As = 11 ou 1, automatiquement au mieux. Les sabots sont remélangés à chaque table ; pendant une
table les cartes sorties ne reviennent pas (compter les cartes est une vraie stratégie —
l'UI montre ce qu'il reste dans ton sabot).

Pas de « partager » (split) ni d'assurance en v1.

## 3. Le score

`score de la main = Jetons × Mult`

1. **Figure** : la main est classée (Blackjack, Triple Sept, Charlie, Pile, Couleur, Paire,
   Main haute, Petite main — définitions dans `types.ts`). La figure donne les Jetons et le Mult
   de base, selon son niveau.
2. **Cartes** : chaque carte de ta main marque de gauche à droite : + sa valeur en Jetons
   (2–10 ; V, D, R = 10 ; As = 11), puis son amélioration, puis les atouts qui réagissent aux cartes.
3. **Atouts** : chaque atout de gauche à droite applique son effet de main.
4. **Doubler** : ×2 Mult.
5. **Verdict** :
   - **Victoire** (total supérieur, ou croupier crevé) : score complet.
   - **Égalité** : la moitié du Mult.
   - **Défaite** : la banque garde ton Mult (Mult = 1). Tu ne marques que tes Jetons.
   - **Crevé** : 0, rien ne se déclenche.

Le verdict est connu avant la cascade de marquage : l'UI montre d'abord le croupier qui joue
(tension), puis la cascade (récompense), puis le verdict qui frappe le Mult.

Valeurs de départ des figures (niveau 1) — à équilibrer par simulation :

| Figure | Jetons | Mult | par niveau |
|---|---|---|---|
| Blackjack | 60 | 6 | +30 / +3 |
| Triple Sept | 77 | 7 | +35 / +3 |
| Charlie | 50 | 5 | +25 / +2 |
| Pile | 40 | 4 | +20 / +2 |
| Couleur | 35 | 4 | +15 / +2 |
| Paire | 25 | 3 | +15 / +1 |
| Main haute | 20 | 2 | +10 / +1 |
| Petite main | 10 | 1 | +10 / +1 |

## 4. L'argent et la boutique

- Table battue : gain de base (3 / 4 / 5 $) + 1 $ par main non jouée + 1 $ d'intérêt par tranche
  de 5 $ possédés (plafond 5).
- Boutique : 3 offres tirées au hasard (atouts, combines, faveurs, cartes à jouer améliorées),
  1 privilège par salon, relance payante (5 $, +1 à chaque fois), et la **Déchiqueteuse** :
  payer pour retirer définitivement une carte de ton sabot (affiner son deck).
- 5 emplacements d'atouts, 2 de consommables. Revente à moitié prix. L'ordre des atouts compte.

## 5. Contenu — la liste d'idées

> Cette section est la liste d'idées de départ. Le contenu réel, avec les noms, les effets et
> les prix à jour après équilibrage, est dans `src/content/CATALOGUE.md` (généré). Budget de
> texte imposé par un test : 22 caractères pour un nom, 90 pour une phrase de règle.

L'agent contenu implémente au moins 36 atouts, 14 combines, 8 faveurs, 8 privilèges, 12 patrons,
en piochant ici et en inventant. Chaque objet tient en une phrase lisible.
Les axes de synergie à faire exister : la limite, le croupier, les enseignes, les figures
(V/D/R), les petites cartes + Charlie, la prise de risque, l'argent, le deck affiné.

### Atouts

**La limite et la Jauge**
- *Marge de manœuvre* — ta limite passe à 22.
- *Le Vingt-Trois* — limite +2, mais une main de moins par table.
- *Plafond de verre* — limite +3 ; chaque point au-dessus de 21 te coûte 1 $.
- *Funambule* — finir à exactement 1 sous la limite : ×3 Mult.
- *Pile poil* — finir pile sur la limite : +3 Mult par carte en main.
- *Sur le fil* — +Mult égal à ton total.
- *Rase-mottes* — gagner avec 12 ou moins : ×4 Mult.
- *Ascenseur* — +1 limite à chaque main gagnée de la table (revient à 21 à la table suivante).

**Le croupier**
- *Croupier nerveux* — il tire jusqu'à 18.
- *Croupier fatigué* — il crève dès 21 (sa limite passe à 20).
- *Croupier prudent* — il s'arrête à 16.
- *Casse-banque* — quand le croupier crève : ×3 Mult.
- *Rayons X* — sa carte cachée est visible.
- *David* — le battre d'exactement 1 point : ×2,5 Mult.
- *Vampire* — +10 Jetons par point du total du croupier.
- *Miroir* — une égalité compte comme une victoire.
- *Pickpocket* — 2 $ par figure dans la main du croupier.

**Les enseignes**
- *Sang chaud* — chaque ♥ qui marque : +4 Mult.
- *Pique-assiette* — chaque ♠ qui marque : +30 Jetons.
- *Rivière de carreaux* — chaque ♦ qui marque : +1 $.
- *Quatre-feuilles* — chaque ♣ qui marque : 1 chance sur 3 de ×2 Mult.
- *Rouge ou noir* — à chaque main une couleur est tirée ; chaque carte de cette couleur : ×1,5 Mult.
- *Monochrome* — main d'une seule couleur (rouge ou noire) : ×2 Mult.
- *Arc-en-ciel* — les quatre enseignes en main : ×3 Mult.

**Les rangs**
- *Cour royale* — chaque V, D, R qui marque : ×1,5 Mult.
- *Menu fretin* — chaque carte de 2 à 5 qui marque : +5 Mult.
- *Sept merveilles* — chaque 7 qui marque : +7 Mult et +7 Jetons.
- *As dans la manche* — le premier As de la main marque deux fois.
- *Écho* — la dernière carte tirée marque deux fois.
- *Nombres premiers* — 2, 3, 5, 7 : +3 Mult et +15 Jetons chacun.

**Le risque**
- *Tête brûlée* — +3 Mult par carte tirée pendant la main.
- *Sang-froid* — rester avec deux cartes : +60 Jetons.
- *Quitte ou double* — doubler donne ×3 au lieu de ×2.
- *Charlot* — un Charlie se fait avec 4 cartes.
- *Parachute* — une fois par table, si tu crèves, la dernière carte est défaussée à ta place.
- *Lot de consolation* — sur une défaite, tu gardes la moitié de ton Mult.
- *Compteur de cartes* — tu vois la prochaine carte de ton sabot.

**Ce qui grossit**
- *Boule de neige* — +1 Mult définitif par main gagnée ; retombe à 0 si tu crèves.
- *Martingale* — chaque défaite : ×2 Mult sur la main suivante (cumulable), remis à zéro sur une victoire.
- *Pyromane* — +8 Jetons définitifs par carte défaussée.
- *Collectionneur* — +3 Mult par atout possédé.
- *Vieux de la vieille* — +1 Mult définitif par table battue.

**L'argent**
- *Pourboire* — 1 $ par main gagnée.
- *Flambeur* — +1 Mult par tranche de 4 $ possédés.
- *Usurier* — le plafond d'intérêts passe à 10.
- *Carte de fidélité* — la première relance de chaque boutique est gratuite.

### Combines (usage unique)

Tactiques, jouables pendant une main :
- *Coup d'œil* — retourne la carte cachée du croupier.
- *Échange* — échange une de tes cartes avec la carte visible du croupier.
- *Carte brûlée* — envoie à la défausse la prochaine carte de ton sabot (après l'avoir vue).
- *Savonnette* — le croupier doit tirer une carte de plus.
- *Élastique* — limite +2 pour cette main.
- *Tour de manche* — transforme une carte de ta main en As pour cette table et les suivantes.
- *Voyance* — montre les 3 prochaines cartes de ton sabot.

Atelier, jouables en boutique ou entre deux mains, sur des cartes de ton sabot :
- *Teinture* (×4, une par enseigne) — jusqu'à 3 cartes prennent cette enseigne.
- *Plomb*, *Braise*, *Cristal*, *Dorure*, *Marque*, *Voile*, *Ressort*, *Losange* — donne
  l'amélioration correspondante à 1 ou 2 cartes.
- *Faussaire* — copie une carte de ton sabot.
- *Autodafé* — détruit jusqu'à 2 cartes.

### Faveurs
Une par figure : monte la figure d'un niveau. Noms à trouver dans le monde du tripot
(*Clin d'œil du patron*, *Table réservée*…).

### Privilèges (définitifs, un par salon en boutique)
+1 main par table · +1 défausse par table · +1 emplacement d'atout · +1 emplacement de
consommable · +1 offre en boutique · relances à −2 $ · Déchiqueteuse deux fois par boutique ·
limite +1 (très cher, tard).

### Patrons
Chacun tord une règle ; la règle se lit en une phrase sur la plaque de table.
- *La Pince* — ta limite est de 20.
- *Le Mur* — l'objectif est doublé.
- *Madame Dix* — les V, D, R ne marquent pas.
- *Le Borgne* — ta première carte de chaque main est distribuée face cachée.
- *Le Tricheur* — le croupier gagne les égalités.
- *L'Usurier* — chaque carte tirée te coûte 1 $.
- *Le Bègue* — impossible de doubler ni de défausser.
- *Cœur de pierre* / *Pique-nique* / *Carreau cassé* / *Trèfle fané* — une enseigne ne marque pas.
- *Le Chrono* — une main de moins.
- *Le Sabot percé* — après chaque main, 3 cartes de ton sabot partent à la défausse.
- *Le Sobre* — il s'arrête à 19 et ne crève qu'au-delà de 22.
- Salon 8 : *La Maison* — objectif ×2, elle gagne les égalités, et ta limite baisse de 1
  à chaque main.

## 6. Équilibrage

L'agent contenu écrit `tools/sim.ts` : un robot qui joue la stratégie de base sur des milliers
de parties sans atouts, puis avec quelques builds types. Cibles :
- Salon 1 sans aucun atout : petite table battue ~85 %, grande ~70 %, patron ~55 %.
- Un joueur sans synergie meurt vers le salon 3–4 ; un bon build passe le salon 8.
- Objectifs par salon à croissance quasi géométrique (×1,6 à ×2 par salon).

## 7. Qui fait quoi

| Dossier | Propriétaire | Contenu |
|---|---|---|
| `src/engine/**` | bjck-5a | moteur pur : aléatoire à graine, sabots, valeur de main, figures, règles, machine à états, marquage, boutique, `MutationApi`, sauvegarde, tests |
| `src/content/**`, `tools/**` | bjck-6a | atouts, combines, faveurs, privilèges, patrons, textes, équilibrage, simulateur, tests |
| `src/ui/**`, `index.html`, `src/main.ts` | bjck-d4 | scène, cartes, Jauge, shader de fond, écran cathodique, animations, son, écrans |
| contrat, design, revue | bjck-41 | `types.ts` (version initiale), ce document, le skill `sabot-da`, relecture du code |

Règles de cohabitation :
- On n'écrit que dans son dossier. `package.json` : prévenir bjck-41 avant d'ajouter une dépendance.
- `types.ts` appartient à bjck-5a après la version initiale ; toute modification est annoncée
  aux deux autres et à bjck-41, et reste additive si possible.
- Aucun `Math.random` hors de l'UI purement cosmétique : tout passe par le `Rng` du moteur.
- Pas de dépôt git à committer pour l'instant ; ne pas lancer de commandes git destructrices.
- `npm run typecheck` et `npm test` doivent passer avant de dire « terminé ».
- Ne pas lancer `npm run dev` en tâche de fond qui traîne : bjck-d4 est le seul à tenir le
  serveur de dev (port 5173).

## 8. Jalons

1. **Fondations** (en parallèle) : moteur jouable en test sans contenu réel ; contenu écrit
   contre les types avec tests unitaires des crochets ; UI avec scène, cartes, Jauge, fond,
   branchée sur un faux moteur scripté.
2. **Branchement** : `src/main.ts` assemble `createEngine(content)` + UI. Une partie complète
   se joue du salon 1 au salon 8.
3. **Équilibrage et finitions** : simulateur, réglages, sons, écran titre, sauvegarde.
