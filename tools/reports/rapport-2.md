# Rapport de simulation n°2 — 2026-11-24

Balance en vigueur : 5 mains, 2 défausses, pas de défausse après crevé (`discardAfterBust: false`, Harnais pour
la rétablir), limite plafonnée à 23, objectifs calés `[210, 320, 480, 730, 1100, 1670, 2530, 3840]`,
facteurs de table 1 / 1,4 / 1,66. Robots : naïf (reste à 17), base (stratégie de base + défausse
préventive p5 + information visible), malin (tables d'essai dans le vrai moteur, Déchiqueteuse, relances).
Toutes les commandes sont rejouables : `npm run sim -- --exp …` (voir l'en-tête de `tools/sim.ts`).

## Tableau de bord

| Objectif | Cible | Mesuré | Verdict |
|---|---|---|---|
| Salon 1 sans achat (petite / grande / patron) | 85 / 70 / 55 % | 85 / 70 / 55 % (2000 parties) | ✅ |
| Petite table du salon 1 perdue (robot de base) | ≤ 17 % | 15 % | ✅ |
| Robot naïf | meurt au salon 2–3 | salon moyen 1,68 ; 68 % meurent au salon 1 | ❌ trop dur |
| Robot de base | meurt au salon 4–5 | salon moyen 2,33 ; 53 % meurent au salon 1 | ❌ trop dur |
| Robot malin | gagne 15–30 % | 17 % (300 parties) ; mais 43 % meurent au salon 1 | ✅ / ⚠ |
| Croissance des objectifs | ×1,6 à ×2 par salon | ×1,51 (calée sur le malin) | ⚠ |
| Patron qui tue 3× plus que les autres | aucun | base : La Maison 53 %, Le Mur 29 %, les autres ≤ 28 % · malin : Le Borgne 24 % contre une médiane de ~9 % | ⚠ Le Borgne (malin) |
| La Maison battue par le malin quand il l'atteint | 1 fois sur 2 | 85 % (51 sur 60) | ❌ trop facile |
| Tables perdues « sans faute », variante H | ≤ 12 % | 12 % | ✅ (limite) |
| Tables gagnées grâce à un seul naturel (salon 1) | < 1 sur 3 | 22–25 % | ✅ |
| Gain d'un point de limite (mains gagnées) | < +10 points | +7 points (50 → 57 → 64 %) | ✅ |
| Familles (malin, kit de départ) | aucune sous la moitié de la meilleure | enseignes 3,38 et têtes 2,52 contre croissance 7,20 | ❌ |
| Atout présent dans plus de la moitié des victoires du malin | aucun | Vampire 73 %, Sabot léger 57 % | ❌ |
| Atouts sans condition dans les victoires du malin | < 50 % | Corde raide 24 %, Sans filet 16 % | ✅ |
| Main haute en fin de partie | < 80 % des points | 46 % (base), 54 % (malin) | ✅ |
| Boutiques sans rien d'abordable | < 50 % | 0–1 % | ✅ |
| Argent du malin en entrant en boutique au salon 6 | ≤ 25 $ | 22 $ (34 $ au salon 8) | ✅ |
| Vitesse | 10 000 parties en moins d'une minute | base 3,6 ms/partie (36 s) · malin 0,25 s/partie | ✅ |

## 1. Défausse préventive (nouvelle règle)

Robot de base sans achat, salon 1, 4000 parties par politique (`--exp defausse`) :

| Politique | Salon 1 passé | Mains gagnées | Crevés |
|---|---|---|---|
| aucune | 18 % | 43 % | 18 % |
| p1 : 12–16 contre 7+, on garde la meilleure base ≤ 11 | 25 % | 49 % | 7 % |
| p2 : pareil contre toute carte | 31 % | 51 % | 8 % |
| p3 : p1 + revenir à 2 cartes 10/11 pour doubler | 27 % | 49 % | 7 % |
| p5 : p2 + revenir à 2 cartes pour doubler (retenue) | 31 % | 51 % | 8 % |
| p6 : p5 + jeter un 17 dur contre 9/10/As | 31 % | 51 % | 9 % |

La nouvelle règle a l'effet voulu : crever redevient un vrai risque (8 % des mains contre 2 % avant), et bien
défausser vaut +13 points de passage au salon 1.

## 2. Base du jeu (G / H / I, iso-difficulté)

| Variante | Mains gagnées | Crevés | Tables à 0 victoire | Perdues sans faute | Salon moyen |
|---|---|---|---|---|---|
| G : 4 mains, 2 défausses | 52 % | 8 % | 7 % | 22 % | 1,92 ± 1,37 |
| **H : 5 mains, 2 défausses** (appliquée) | 52 % | 9 % | 5 % | 12 % | 2,11 ± 1,63 |
| I : 5 mains, 3 défausses | 54 % | 6 % | 4 % | 10 % | 2,12 ± 1,61 |

H est pile au seuil des 12 %. I reste le repli si on veut une marge.

## 3. Limite

Mains gagnées pour une limite de 21 → 22 → 23 : 50 → 57 → 64 % ; salon 1 passé : 52 → 65 → 75 %. Le plafond à
23 tient, et un point vaut 7 points de mains gagnées (sous le seuil de 10).

## 4. Calage des objectifs : un conflit de cibles

La routine (`--exp calage`) cale le salon 1 sans achat, puis une croissance géométrique pour ~22 % de victoires
du robot malin, puis mesure le robot de base.

| Cibles du salon 1 (sans achat) | Base, facteurs | Croissance | Malin | Robot de base |
|---|---|---|---|---|
| 85 / 70 / 55 % (en vigueur) | 210, 1 / 1,4 / 1,66 | ×1,51 | 22 % | salon 2,36 |
| 95 / 85 / 75 % (proposée) | 160, 1 / 1,39 / 1,6 | ×1,69 | 22 % | salon 3,03 |

Avec 85 / 70 / 55 %, on ne passe le salon 1 sans achat qu'une fois sur trois (0,85 × 0,70 × 0,55). Tous les
robots meurent donc d'abord là : 43 % des parties du malin, 53 % du robot de base. Une fois le salon 1 passé, le
malin gagne 90 à 99 % de ses tables. La difficulté est concentrée au départ, puis le malin fait boule de neige.
Assouplir le salon 1 permet une croissance plus raide, dans la fourchette du design, à victoires du malin
égales. Le robot de base progresse alors de 0,7 salon mais n'atteint pas 4–5 : il achète tout sans chercher de
synergie. Atteindre 4–5 demanderait un salon 1 encore plus doux, ou d'accepter que ce robot meure vers le salon 3.

## 5. La Maison (version 2)

Le malin l'atteint 60 fois sur 300 et la bat 51 fois (85 %, cible 50 %). Elle est trop facile, parce que le
malin arrive au salon 8 avec un build qui marque 10 à 60 fois l'objectif en une main. Proposition : objectif
×2 au lieu de ×1,5, en gardant la limite −1 par main gagnée ; je remesure dès que c'est validé.
Correction de mesure : dans le rapport n°1, La Maison apparaissait « imbattable » à cause d'un défaut de mon
enregistreur (battre le dernier patron ne produit pas d'événement « table gagnée ») ; c'est corrigé.

## 6. Valeur marginale des atouts

Robot de base, l'atout donné seul au départ, il achète tout sauf des atouts (l'argent et la Déchiqueteuse
servent), 400 parties sur les mêmes graines (`--exp marginal`). Gain en tables gagnées par rapport à la
référence (2,54).
**Étalons fictifs : « +4 Mult sans condition » = +5,9 tables ; « +30 Jetons » = +3,9 tables.**
▲ = plus du double de la médiane de sa rareté, ▼ = moins de la moitié.

**Communs (médiane +0,94)** — Vampire +6,39 ▲ · Vieux de la vieille +5,57 ▲ · Sang-froid +5,19 ▲ · Sur le fil
+4,69 ▲ · Mille-pattes +4,59 ▲ · Collectionneur +3,14 ▲ · Tête brûlée +2,74 ▲ · Sang chaud +2,65 ▲ · Nombres
premiers +2,40 ▲ · Cigare +2,06 ▲ · Pique-assiette +1,77 · Coupe-gorge +1,61 · Menu fretin +1,44 · Cicatrices
+1,29 · Gros calibre +1,21 · Sept merveilles +0,94 · Trèfle +0,75 · Jumeaux +0,44 ▼ · Tirelire +0,40 ▼ · Lot de
consolation +0,38 ▼ · Pourboire +0,34 ▼ · Charognard +0,26 ▼ · Racket +0,25 ▼ · Pickpocket +0,22 ▼ · Rivière de
carreaux +0,12 ▼ · Croupier nerveux +0,09 ▼ · Carte maîtresse +0,07 ▼ · Croupier prudent +0,07 ▼ · Carte de
fidélité 0 ▼ · Altitude 0 ▼ · Rayons X −0,18 ▼

**Peu communs (médiane +0,85)** — Pyromane +8,96 ▲ · Boule de neige +4,90 ▲ · Tapis +3,70 ▲ · Sabot léger +3,46
▲ · Corde raide +2,58 ▲ · Casse-banque +2,28 ▲ · Rouge ou noir +2,16 ▲ · Funambule +2,03 ▲ · Compteur de cartes
+1,39 · Roulette russe +1,33 · Cour royale +1,27 · Monochrome +1,19 · Marge de manœuvre +1,07 · Écho +1,04 ·
Haute société +0,88 · Dix de der +0,85 · Ascenseur +0,77 · David +0,67 · Parachute +0,65 · Flambeur +0,50 ·
Miroir +0,40 ▼ · Harnais +0,30 ▼ · Charlot +0,30 ▼ · As dans la manche +0,27 ▼ · Quitte ou double +0,15 ▼ ·
Rase-mottes +0,09 ▼ · Pile poil +0,07 ▼ · Le Naturel +0,06 ▼ · Cinq à sept +0,01 ▼ · Prêteur sur gages 0 ▼

**Rares (médiane +0,46)** — Sans filet +2,89 ▲ · Martingale +2,07 ▲ · Plafond de verre +1,68 ▲ · Croupier fatigué
+0,46 · Le Vingt-Trois +0,25 · Arc-en-ciel +0,04 ▼ · Poids plume 0 ▼

**Légendaires** — Le Parrain +7,33 ▲ · L'Ambidextre +2,37

Lecture : la médiane des communs est six fois sous l'étalon « +4 Mult ». Les atouts forts ne sont pas
démesurés, ce sont la plupart des autres qui valent trop peu. Le Mult de base minuscule (2 en Main haute)
rend tout +Mult fixe énorme, et les effets conditionnels rares quasi nuls.
Limites de la mesure : un atout seul ne montre pas ses synergies (Altitude, Charlot, Carte maîtresse, Poids
plume valent 0 seuls). Les atouts d'argent valent peu parce que le robot de base convertit mal l'argent en
score. Rayons X ≈ 0 : connaître la carte cachée ne sert presque à rien quand une défaite paie encore ses Jetons.

### Corrections proposées (à valider ; objectif : chaque commun vers +3 à +5 tables)

Trop forts :
- Pyromane : +8 → +3 Jetons par défausse (la défausse préventive le déclenche deux fois par table).
- Le Parrain : départ ×1,5, +0,5 par patron battu, plafond ×4.
- Boule de neige : retombe à 0 sur une défaite aussi, pas seulement sur un crevé.
- Vieux de la vieille : +1 Mult par patron battu au lieu de chaque table (8 au plus).
- Sabot léger : +3 → +2 Mult par carte retirée (dans 57 % des victoires du malin).
- Vampire : +4 → +3 Jetons par point du croupier (dans 73 % des victoires du malin).
- Tapis : ×3 → ×2,5. Sans filet : ×2,5 → ×2.

Trop faibles :
- Atouts d'argent : doubler le gain (Pourboire 2 $, Tirelire 5 $, Charognard 3 $, Pickpocket 2 $ par tête, Rivière 2 $, Racket 2 $ par main) et passer à 3–4 $.
- Croupier nerveux / prudent : ±2 au lieu de ±1 (18 → 19 ; 16 → 15).
- Jumeaux : +8 → +15 Mult. Pile poil : « Pile : ×3 Mult ». Le Naturel : ×3 → ×5.
- Rase-mottes : « gagner avec 14 ou moins ». As dans la manche : « chaque As qui marque : +8 Mult ».
- Arc-en-ciel : « trois enseignes ou plus : ×3 ».
- Cinq à sept et Charlot : le Charlie ne sort que dans 1 % des mains. Proposition de fond : `charlieSize` de base à 4, ou fusionner les deux atouts.
- Rayons X : ajouter un effet, par exemple « … ; +20 Jetons quand tu le bats ».
- Le Vingt-Trois : la main en moins coûte trop à 5 mains → « une défausse de moins » à la place.

## 7. Argent

Le malin entre en boutique avec 10, 13, 17, 20, 21, 22, 26, 34 $ (salons 1 à 8). Sous le seuil des 25 $ au
salon 6 : pas de puits nécessaire pour l'instant. Si les atouts d'argent sont renforcés, il faudra le remesurer.

## 8. Familles (kit de 3 atouts au départ, achats limités à la famille)

| Famille | Malin : salon moyen (victoires) | Base : salon moyen (victoires) |
|---|---|---|
| Croissance | 7,20 (48 %) | 7,27 (50 %) |
| Croupier | 6,03 (6 %) | 6,14 (9 %) |
| Légendaires | 5,22 (4 %) | 5,73 (10 %) |
| Sabot | 5,08 (38 %) | 2,87 (1 %) |
| Limite | 5,04 (3 %) | 5,67 (3 %) |
| Risque | 4,86 (8 %) | 4,71 (8 %) |
| Argent | 4,09 (0 %) | 3,21 (15 %) |
| Petites cartes | 3,79 (0 %) | 3,76 (0 %) |
| Enseignes | 3,38 ⚠ (0 %) | 3,92 (1 %) |
| Têtes | 2,52 ⚠ (0 %) | 2,83 ⚠ (0 %) |

Malin : 80 parties par famille ; base : 1000. Le kit croissance (Boule de neige + Vieux de la vieille +
Collectionneur) gagne une partie sur deux, même après les baisses du rapport n°1 : les corrections du §6 le
visent. Le sabot est en tout ou rien : il démarre mal (25 % de petites tables du salon 1 perdues), puis
explose grâce à la Déchiqueteuse. Pour remonter les enseignes et les têtes : Sang chaud +5 Mult, Monochrome
×2,5, Cour royale ×2, Gros calibre +20 Jetons, Haute société ×3.

## 9. Fait pendant ce lot (contenu)

Harnais ajouté, `discardAfterBust: false`, La Maison version 2, quatre baisses de +Mult, limite plafonnée à
23, Triple Sept secrète (`canAppear` sur Patte de lapin), Plafond de verre à +2, « (23 au plus) » sur
Ascenseur et Passe-droit, texte de l'Arlequin, Autodafé au plancher du sabot, 6 sabots de départ, 10
pots-de-vin. Tests : contenu + simulateur verts ; `npm test` et `npm run typecheck` verts sur tout le projet.

## Décisions attendues

1. Cibles du salon 1 : garder 85 / 70 / 55 (le robot de base meurt vers le salon 2,4) ou passer à 95 / 85 / 75
   (croissance ×1,69, robot de base vers 3) ? Ou accepter que le robot de base meure vers le salon 3.
2. La Maison : objectif ×2 ?
3. Corrections d'atouts du §6, en bloc ou au cas par cas.
4. Charlie : `charlieSize` à 4 ?
