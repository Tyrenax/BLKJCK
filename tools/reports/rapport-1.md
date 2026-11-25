# Rapport de simulation n°1 — sorties brutes (2026-11-24)

Stratégie : base + « tire jusqu'à 17 tant qu'il reste une défausse ». Contenu au moment du lancement : balance actuelle (objectifs 150→7400, facteurs 1/1,5/2, limite max 24).

## basic-nobuy
```
== robot basic · sans achat — 3000 parties, 28.9 s (9.6 ms/partie, 50 actions/partie, 193 µs/action)
Victoire 0% · salon atteint moy 1.62 ± 0.61 (p10 1 · p50 2 · p90 2)
Meurt au salon : 1:45% 2:48% 3:7% 4:0% 5:0% 6:0% 7:0% 8:0% · gagne : 0%
Réussite par table (gagnées / jouées) :
  salon        petite       grande       patron
      1    98% (3000)   87% (2941)   64% (2558)
      2    78% (1647)   57% (1290)    27% (740)
      3     39% (198)     26% (78)     10% (20)
      4       50% (2)       0% (1)            —
Patrons (taux de mort quand rencontré) : le-sobre 100%/3 · le-mur 100%/2 · le-radin 100%/1 · le-chrono 88%/66 · le-borgne 81%/78 · le-begue 81%/77 · la-pince 80%/55 · madame-dix 74%/58 · trefle-fane 46%/417 · carreau-casse 44%/417 · pique-nique 43%/417 · coeur-de-pierre 42%/429 · le-tricheur 39%/426 · le-sabot-perce 34%/461 · l-usurier 33%/411
Mains : victoire 60% · égalité 12% · défaite 25% · crevé 3%
Victoires par table (0/1/2/3/4+) : toutes 4% / 38% / 41% / 15% / 2% · salon 1 4% / 43% / 41% / 11% / 1%
Tables perdues : 3000 · par nb de victoires 10% / 33% / 39% / 16% / 3% · « sans faute » (moins de victoires que le p10 des tables gagnées) 10%
Victoires « nécessaires » (p10 des tables gagnées, P/G/B) salons 1-3 : 1/1/1  1/1/1  1/2/2
Petite table du salon 1 perdue : 2% (cible ≤ 17 %)
Blackjack au salon 1 : 20% des points · 16% des tables gagnées ne l'auraient pas été sans lui
Figures (mains/points) salons 1-2 : BJ 5%/20% · 777 0%/0% · Charlie 2%/6% · Pile 13%/29% · Couleur 2%/2% · Paire 12%/10% · Haute 61%/32% · Petite 5%/1%
Boutiques : 9475 · achats/boutique 0.00 · rien d'abordable 0% · argent en entrant 1:12$ 2:31$ 3:57$ 4:82$
Score moyen d'une main / (objectif ÷ mains) par salon : 1:2.77 2:1.59 3:0.94 4:0.62
Pire cas : une carte déclenchée 1 fois dans une main · plus grosse main = 4.6× l'objectif de sa table

```

## naive
```
== robot naive — 3000 parties, 58.7 s (19.6 ms/partie, 87 actions/partie, 225 µs/action)
Victoire 0% · salon atteint moy 2.60 ± 1.85 (p10 1 · p50 2 · p90 5)
Meurt au salon : 1:34% 2:29% 3:14% 4:8% 5:5% 6:3% 7:3% 8:3% · gagne : 0%
Réussite par table (gagnées / jouées) :
  salon        petite       grande       patron
      1    99% (3000)   89% (2971)   75% (2655)
      2    90% (1982)   83% (1790)   74% (1493)
      3    93% (1103)   85% (1022)    79% (873)
      4     93% (687)    89% (642)    77% (574)
      5     92% (440)    91% (405)    77% (369)
      6     94% (284)    89% (267)    80% (238)
      7     91% (190)    84% (172)    70% (145)
      8     91% (102)     83% (93)      0% (77)
Patrons (taux de mort quand rencontré) : la-maison 100%/77 · le-mur 45%/172 · le-begue 32%/299 · le-chrono 28%/283 · le-borgne 27%/286 · trefle-fane 27%/614 · le-tricheur 24%/610 · pique-nique 24%/637 · coeur-de-pierre 24%/643 · le-sobre 24%/157 · carreau-casse 23%/592 · le-douanier 22%/107 · madame-dix 22%/271 · la-pince 22%/285 · le-sabot-perce 21%/647 · l-usurier 20%/591 · le-radin 19%/153
Mains : victoire 58% · égalité 12% · défaite 28% · crevé 2%
Victoires par table (0/1/2/3/4+) : toutes 6% / 51% / 33% / 9% / 1% · salon 1 5% / 48% / 38% / 9% / 1%
Tables perdues : 3000 · par nb de victoires 18% / 36% / 31% / 12% / 2% · « sans faute » (moins de victoires que le p10 des tables gagnées) 18%
Victoires « nécessaires » (p10 des tables gagnées, P/G/B) salons 1-3 : 1/1/1  1/1/1  1/1/1
Petite table du salon 1 perdue : 1% (cible ≤ 17 %)
Blackjack au salon 1 : 20% des points · 14% des tables gagnées ne l'auraient pas été sans lui
Figures (mains/points) salons 1-2 : BJ 5%/18% · 777 0%/0% · Charlie 2%/5% · Pile 12%/27% · Couleur 2%/2% · Paire 11%/10% · Haute 68%/38% · Petite 0%/0%
Figures (mains/points) salons 5-8 : BJ 4%/11% · 777 0%/0% · Charlie 2%/6% · Pile 14%/23% · Couleur 2%/2% · Paire 11%/10% · Haute 66%/49% · Petite 0%/0%
Boutiques : 18574 · achats/boutique 1.11 · rien d'abordable 0% · argent en entrant 1:9$ 2:10$ 3:13$ 4:23$ 5:41$ 6:64$ 7:90$ 8:119$
Score moyen d'une main / (objectif ÷ mains) par salon : 1:3.22 2:4.07 3:4.77 4:4.26 5:3.63 6:3.23 7:2.59 8:1.48
Atouts (salon moyen atteint quand possédé · ×gain moyen par main gagnée · nb parties · présence dans les victoires) :
  meilleurs : collectionneur[croissance] s5.8 ×3.63 n172 v20% | le-parrain[legendaire] s5.5 ×3.43 n2 v0% | vieux-de-la-vieille[croissance] s5.3 ×3.84 n194 v50% | vampire[croupier] s5.2 ×2.48 n177 v50% | boule-de-neige[croissance] s5.2 ×3.12 n65 v20% | plafond-de-verre[limite] s4.9 ×1.00 n15 v0% | sur-le-fil[limite] s4.5 ×1.97 n181 v0% | cigare[croissance] s4.5 ×3.42 n156 v0% | mille-pattes[petites] s4.4 ×1.81 n184 v10% | nombres-premiers[petites] s4.4 ×1.83 n176 v40%
  pires     : poids-plume[sabot] s3.2 ×1.00 n21 v0% | rase-mottes[petites] s3.1 ×1.00 n90 v0% | vingt-trois[limite] s3.1 ×1.00 n22 v0% | carte-de-fidelite[argent] s3.1 ×1.00 n170 v0% | sabot-leger[sabot] s3.0 ×1.01 n80 v0% | compteur-de-cartes[risque] s3.0 ×1.00 n66 v0% | sans-filet[risque] s3.0 ×2.50 n25 v0% | charlot[petites] s2.9 ×1.00 n70 v0%
  plus gros ×gain : vieux-de-la-vieille ×3.84 · collectionneur ×3.63 · cigare ×3.42 · boule-de-neige ×3.12 · tapis ×3.00 · sans-filet ×2.50 · vampire ×2.48 · corde-raide ×1.99
Pire cas : une carte déclenchée 3 fois dans une main · plus grosse main = 36.3× l'objectif de sa table

```

## basic
```
== robot basic — 3000 parties, 62.4 s (20.8 ms/partie, 102 actions/partie, 204 µs/action)
Victoire 1% · salon atteint moy 2.96 ± 2.07 (p10 1 · p50 2 · p90 6)
Meurt au salon : 1:30% 2:26% 3:12% 4:10% 5:7% 6:6% 7:4% 8:4% · gagne : 1%
Réussite par table (gagnées / jouées) :
  salon        petite       grande       patron
      1    98% (3000)   90% (2941)   79% (2646)
      2    91% (2099)   87% (1917)   78% (1671)
      3    94% (1311)   91% (1234)   83% (1125)
      4     94% (938)    90% (884)    81% (799)
      5     93% (651)    90% (606)    82% (543)
      6     93% (446)    88% (415)    72% (366)
      7     95% (262)    86% (249)    68% (215)
      8     92% (146)    87% (135)     0% (118)
Patrons (taux de mort quand rencontré) : la-maison 100%/118 · le-mur 41%/247 · le-begue 33%/388 · le-chrono 26%/355 · madame-dix 24%/348 · pique-nique 22%/687 · carreau-casse 22%/661 · le-borgne 21%/355 · le-tricheur 19%/702 · coeur-de-pierre 19%/660 · trefle-fane 19%/661 · la-pince 19%/348 · le-radin 16%/226 · le-sabot-perce 16%/697 · le-douanier 14%/146 · le-sobre 13%/230 · l-usurier 12%/654
Mains : victoire 61% · égalité 12% · défaite 25% · crevé 2%
Victoires par table (0/1/2/3/4+) : toutes 6% / 51% / 33% / 9% / 1% · salon 1 4% / 48% / 39% / 9% / 1%
Tables perdues : 3000 · par nb de victoires 14% / 35% / 33% / 15% / 3% · « sans faute » (moins de victoires que le p10 des tables gagnées) 14%
Victoires « nécessaires » (p10 des tables gagnées, P/G/B) salons 1-3 : 1/1/1  1/1/1  1/1/1
Petite table du salon 1 perdue : 2% (cible ≤ 17 %)
Blackjack au salon 1 : 18% des points · 14% des tables gagnées ne l'auraient pas été sans lui
Figures (mains/points) salons 1-2 : BJ 5%/17% · 777 0%/0% · Charlie 2%/6% · Pile 14%/29% · Couleur 2%/2% · Paire 11%/10% · Haute 61%/34% · Petite 5%/1%
Figures (mains/points) salons 5-8 : BJ 4%/10% · 777 0%/0% · Charlie 3%/6% · Pile 16%/26% · Couleur 2%/2% · Paire 11%/10% · Haute 59%/42% · Petite 5%/2%
Boutiques : 21717 · achats/boutique 1.28 · rien d'abordable 1% · argent en entrant 1:8$ 2:7$ 3:8$ 4:12$ 5:20$ 6:30$ 7:47$ 8:69$
Score moyen d'une main / (objectif ÷ mains) par salon : 1:3.51 2:4.59 3:5.59 4:4.90 5:4.21 6:3.37 7:2.86 8:1.58
Atouts (salon moyen atteint quand possédé · ×gain moyen par main gagnée · nb parties · présence dans les victoires) :
  meilleurs : collectionneur[croissance] s6.3 ×3.77 n209 v27% | boule-de-neige[croissance] s5.9 ×3.69 n82 v33% | vampire[croupier] s5.3 ×2.45 n193 v47% | cigare[croissance] s5.1 ×3.14 n188 v0% | sur-le-fil[limite] s5.1 ×1.99 n193 v0% | tapis[risque] s5.1 ×2.99 n87 v20% | vieux-de-la-vieille[croissance] s5.0 ×3.39 n175 v73% | mille-pattes[petites] s4.8 ×1.79 n266 v27% | pyromane[croissance] s4.8 ×1.60 n82 v33% | nombres-premiers[petites] s4.6 ×1.75 n214 v7%
  pires     : croupier-nerveux[croupier] s3.7 ×1.00 n196 v0% | sans-filet[risque] s3.6 ×2.45 n14 v0% | as-dans-la-manche[tetes] s3.6 ×1.00 n79 v0% | rayons-x[croupier] s3.6 ×1.00 n185 v0% | miroir[croupier] s3.5 ×1.00 n90 v7% | rase-mottes[petites] s3.4 ×1.01 n87 v7% | compteur-de-cartes[risque] s3.4 ×1.00 n67 v0% | poids-plume[sabot] s3.4 ×1.00 n17 v0%
  plus gros ×gain : collectionneur ×3.77 · boule-de-neige ×3.69 · vieux-de-la-vieille ×3.39 · cigare ×3.14 · tapis ×2.99 · sans-filet ×2.45 · vampire ×2.45 · corde-raide ×2.00
Pire cas : une carte déclenchée 2 fois dans une main · plus grosse main = 54.4× l'objectif de sa table

```

## limite
```
Valeur d’un point de limite — robot de base sans achat, stratégie recalée sur la limite.
limite 21                  victoire   0% · salon 1.61 ± 0.61 · S1 passé  55% · S1P perdue   2% · main gagnée  60% · crevé   3% · tables à 0 victoire   4% · pertes « sans faute »  10%
limite 22                  victoire   0% · salon 1.81 ± 0.66 · S1 passé  67% · S1P perdue   1% · main gagnée  69% · crevé   3% · tables à 0 victoire   2% · pertes « sans faute »   6%
limite 23                  victoire   0% · salon 1.97 ± 0.67 · S1 passé  76% · S1P perdue   1% · main gagnée  76% · crevé   3% · tables à 0 victoire   1% · pertes « sans faute »   8%
limite 24                  victoire   0% · salon 1.95 ± 0.67 · S1 passé  75% · S1P perdue   2% · main gagnée  79% · crevé   5% · tables à 0 victoire   1% · pertes « sans faute »   6%
limite 25                  victoire   0% · salon 1.95 ± 0.67 · S1 passé  75% · S1P perdue   2% · main gagnée  80% · crevé   5% · tables à 0 victoire   1% · pertes « sans faute »   6%
```

## chance
```
Expérience « part de chance » — robot de base, objectifs recalés pour passer le salon 1 dans 72% des cas.
A référence ×1.00 naive    victoire   0% · salon 2.58 ± 1.84 · S1 passé  66% · S1P perdue   1% · main gagnée  58% · crevé   2% · tables à 0 victoire   6% · pertes « sans faute »  18% · victoires/table 6%/50%/34%/9%/1%
A référence ×1.00 basic    victoire   1% · salon 2.90 ± 2.04 · S1 passé  69% · S1P perdue   2% · main gagnée  61% · crevé   2% · tables à 0 victoire   6% · pertes « sans faute »  14% · victoires/table 6%/51%/33%/9%/1%
B 5 mains ×1.32 naive      victoire   1% · salon 2.69 ± 2.00 · S1 passé  65% · S1P perdue   2% · main gagnée  58% · crevé   3% · tables à 0 victoire   4% · pertes « sans faute »  11% · victoires/table 4%/40%/37%/14%/4%
B 5 mains ×1.32 basic      victoire   1% · salon 3.03 ± 2.14 · S1 passé  69% · S1P perdue   2% · main gagnée  60% · crevé   3% · tables à 0 victoire   3% · pertes « sans faute »   8% · victoires/table 3%/41%/36%/14%/5%
C défaite ×0,25 ×1.02 naive victoire   1% · salon 2.64 ± 1.94 · S1 passé  65% · S1P perdue   1% · main gagnée  57% · crevé   3% · tables à 0 victoire   7% · pertes « sans faute »  17% · victoires/table 7%/50%/33%/9%/1%
C défaite ×0,25 ×1.02 basic victoire   1% · salon 3.02 ± 2.13 · S1 passé  70% · S1P perdue   2% · main gagnée  61% · crevé   2% · tables à 0 victoire   6% · pertes « sans faute »  13% · victoires/table 6%/50%/33%/9%/1%
D égalité ×1 ×1.08 naive   victoire   0% · salon 2.52 ± 1.82 · S1 passé  64% · S1P perdue   1% · main gagnée  57% · crevé   2% · tables à 0 victoire   9% · pertes « sans faute »  13% · victoires/table 9%/46%/34%/10%/1%
D égalité ×1 ×1.08 basic   victoire   0% · salon 2.83 ± 1.96 · S1 passé  69% · S1P perdue   2% · main gagnée  61% · crevé   2% · tables à 0 victoire   7% · pertes « sans faute »  12% · victoires/table 7%/48%/33%/10%/2%
E 3 défausses ×1.08 naive  victoire   1% · salon 2.43 ± 1.79 · S1 passé  61% · S1P perdue   1% · main gagnée  58% · crevé   1% · tables à 0 victoire   6% · pertes « sans faute »  16% · victoires/table 6%/48%/35%/10%/2%
E 3 défausses ×1.08 basic  victoire   0% · salon 2.96 ± 2.04 · S1 passé  71% · S1P perdue   1% · main gagnée  63% · crevé   1% · tables à 0 victoire   5% · pertes « sans faute »  11% · victoires/table 5%/49%/34%/11%/2%
F 5 mains + ×0,25 ×1.34 naive victoire   1% · salon 2.76 ± 2.12 · S1 passé  63% · S1P perdue   2% · main gagnée  58% · crevé   3% · tables à 0 victoire   4% · pertes « sans faute »  10% · victoires/table 4%/40%/36%/15%/4%
F 5 mains + ×0,25 ×1.34 basic victoire   1% · salon 3.15 ± 2.25 · S1 passé  68% · S1P perdue   2% · main gagnée  60% · crevé   3% · tables à 0 victoire   4% · pertes « sans faute »   7% · victoires/table 4%/41%/35%/15%/5%
```

