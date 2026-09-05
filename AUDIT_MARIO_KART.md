> Mise à jour du 5 septembre 2026 après corrections : banque sonore enregistrée et mixage intégrés ; étoile/contact, défense tenue et tirs directionnels corrigés ; réactions distinctes et décisions d’objets IA ajoutées ; premier raccourci herbe/boost jouable ; surfaces des karts et caméra par état refaites. Voir [VALIDATION.md](VALIDATION.md) pour les vérifications actuelles. Les constats ci-dessous décrivent la version auditée avant ces modifications ; les modèles restent procéduraux et le vol conserve son assistance.

# Audit Mario Kart — son, conduite et direction visuelle

5 septembre 2026. Synthèse de trois audits indépendants : audio, gameplay, direction visuelle. Analyse du code actuel et de références officielles Nintendo. Aucune écoute comparative ni inspection du rendu local n’a été effectuée pendant cet audit. Les impressions sonores et visuelles indiquées sont des hypothèses de conception étayées par l’implémentation, à confirmer en jeu. Le comportement étoile décrit plus bas a été reproduit par simulation.

## Diagnostic

Le projet possède déjà les mécanismes de base : saut de drift, côté engagé, contre-braquage, trois niveaux de mini-turbo, départ turbo, figure au tremplin, deux objets, pièces, adversaires et deltaplane. Leur présence et les 66 tests existants ne valident pas encore la qualité ressentie.

Le déficit sonore est structurel : un oscillateur moteur, un bruit mono partagé, des bips génériques et aucun paysage sonore autour du joueur. En parallèle, la piste reste une seule trajectoire bordée de barrières ; ses secteurs ont davantage de différences décoratives que de situations de conduite différentes.

La cible recommandée est un moteur crédible, des contacts ayant une matière identifiable et des objets expressifs qu’on reconnaît immédiatement à l’oreille. Le guide publié par Nintendo décrit les paliers de drift, les figures, les surfaces hors route et les usages variés des objets : ce sont des références de comportement, pas des réglages physiques à copier exactement. [Techniques de course — Nintendo](https://www.nintendo.com/jp/ichikara/aabpa/index_en.html).

## Priorités sonores

| Ordre | Constat dans le projet | Travail à effectuer | Critère d’acceptation proposé |
|---|---|---|---|
| 1 | `audio.ts:22–44` : moteur à un oscillateur en dents de scie ; hauteur liée à la vitesse, sans entrée accélérateur/charge. | Mélanger des boucles moteur ralenti, bas et haut régime, avec variantes en charge et au relâchement. Faire évoluer un régime audio avec accélérateur, vitesse et boost. Garder des transitions continues. | À vitesse proche, appuyer puis relâcher les gaz doit changer le timbre immédiatement. Une boucle ne doit pas produire de raccord audible. |
| 2 | `audio.ts:26–35,78–92` : la même boucle de bruit de 0,4 s sert aux pneus, vent, turbos et impacts. | Séparer roulement, dérapage, frottement de glissière, choc de carrosserie, ouverture d’aile et réception. Ajouter plusieurs prises/variantes de contacts ; doser les chocs par intensité et les frottements par durée. | On doit distinguer un glissement, un effleurement de rail et un choc frontal sans regarder l’image. |
| 3 | `game.ts:124` ignore `event.item` : tous les objets utilisés aboutissent au même bip de 750 Hz. Les rebonds et destructions visibles n’ont pas de son dédié. | Sons propres au champignon, à la banane, aux carapaces, à l’étoile et au klaxon ; roulette puis confirmation distinctes ; lancement, passage, rebond et casse des projectiles. | Un petit test d’écoute permet de reconnaître chaque famille d’objet sans son icône. |
| 4 | Seuls les événements du joueur sont transmis au son ; aucune spatialisation, aucune alerte d’approche de projectile. | Moteurs des concurrents proches avec distance et placement gauche/droite ; passages et projectiles situés dans l’espace. Ajouter une alerte de carapace réellement dirigée vers le joueur, plus pressante à l’approche. | Un dépassement change de côté de manière cohérente. Une alerte ne sonne pas pour un projectile qui s’éloigne ou vise quelqu’un d’autre. |
| 5 | Toutes les sources vont directement à la sortie ; aucun groupe de volume, aucune ambiance, musique ou voix. L’arrivée est encore un bip. | Groupes moteur/effets/ambiance/musique, priorité aux alertes, maîtrise des crêtes. Puis ambiances de port, foule et tunnel, musique originale du circuit et transition au dernier tour ; départ/arrivée mis en scène. | Le moteur n’écrase pas les alertes ; une course complète reste lisible à volume confortable, avec une évolution au dernier tour. |

Les quatre premiers points ont un impact direct sur les bruitages demandés. Les fondations de mixage du point 5 doivent accompagner leur intégration ; musique et voix peuvent ensuite être ajoutées sans masquer ces sons.

L’absence d’alerte est un écart de gameplay documenté : les notes officielles de Mario Kart 8 Deluxe mentionnent la correction du son d’avertissement lorsqu’une carapace rouge ou bleue arrive par derrière. [Mises à jour — Nintendo](https://en-americas-support.nintendo.com/app/answers/detail/a_id/26098/).

## Banque sonore et architecture à préparer

Pour le prochain lot, prévoir des fichiers sources distincts pour moteur, pneus, carrosserie, rail, aile et objets. Conserver les petits sons de charge synthétiques est possible ; le moteur et les contacts bénéficieraient particulièrement d’enregistrements préparés pour le jeu.

- **Moteur** : plusieurs régimes et états de charge, boucles préparées et fondu entre couches. Cette approche régime/charge est décrite dans le [guide de production audio véhicule publié par Audiokinetic](https://www.audiokinetic.com/media/blog/LoopBasedCarEngineDesign/vehicle_audio_modding_guide_for_wreckfest-Wwise2019_2_9.pdf).
- **Contacts** : [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) propose 130 fichiers annoncés CC0. C’est une piste de sélection pour les matières et impacts ; leur adéquation n’a pas encore été écoutée.
- **Ambiance de référence** : [Karting.flac de qubodup](https://freesound.org/people/qubodup/sounds/189628/) est un enregistrement stéréo de karting intérieur annoncé CC0. Il s’agit d’une ambiance de piste, pas d’un moteur isolé prêt à suivre les gaz. Aucun téléchargement ni intégration n’a été effectué.

Avant intégration, créer un catalogue de sons avec événement, variantes, volume, durée de boucle et provenance. Faire remonter des événements explicites depuis la course et les projectiles, avec type de contact, position et intensité. Éviter de déduire tous les sons de la seule hausse d’un compteur de boost ou de l’état final du kart.

Point technique à vérifier : `AudioEngine.start()` appelle `resume()` sans traiter son résultat. Un lancement depuis le téléphone peut ne pas déverrouiller l’audio sur l’ordinateur. Risque relevé dans le code, non reproduit pendant cet audit. Prévoir un état audio visible et un geste d’activation local si le navigateur le demande.

## Écarts de conduite et d’objets

| Priorité | Écart | Amélioration |
|---|---|---|
| Haute | L’objet est utilisé immédiatement ; aucune tenue derrière le kart ni choix avant/arrière. | Distinguer pression, maintien et relâchement ; ajouter protection et lancer directionnel avec animation et son correspondants. |
| Haute | Les attaques convergent vers la même réaction `speed *= .3`, `hit = 1.25`. | Différencier tête-à-queue sur banane, coup de carapace et choc de carrosserie ; synchroniser perte de contrôle, récupération, animation et son. |
| Haute | Une seule surface jouable, barrières continues et vol très assisté. | Ajouter une portion hors route qui ralentit, un raccourci viable avec champignon et un atterrissage demandant un choix de trajectoire. Cela nécessite des surfaces et chemins supplémentaires, pas seulement du décor. |
| Moyenne | L’IA utilise encore un créneau périodique pour les objets ; tous les bots reçoivent un turbo de départ scripté. | Donner des profils de décision, risque et timing ; soumettre leur départ aux mêmes gestes/timings que le joueur. |
| Moyenne | La course offre peu de choix tactiques entre ligne rapide, pièces et boîtes. | Placer ces récompenses à des endroits qui imposent un vrai arbitrage, puis adapter les adversaires à ces choix. |

**Bug confirmé à traiter avant enrichissement : dégâts d’étoile sans vrai contact.** `race.ts:69–70` applique les dégâts avant la collision par volumes orientés. Scénario reproduit par l’agent : deux karts aux distances 100 et 104 m, voie 0, orientation à 90°, vitesse nulle ; le premier possède une étoile. `kartContact` retourne 0, mais une mise à jour de course inflige `hit = 1.25` au second. Conditionner le pouvoir à la collision géométrique effective. La correction n’a pas été effectuée dans cet audit.

## Direction visuelle et circuit

1. **Composer une séquence de course.** `course.ts` décrit une seule spline de largeur 17 m. Proposer une grande courbe permettant le drift, un virage resserré, un choix de raccourci et une réception lisible. Placer les pièces et boîtes au service de ces trajectoires.
2. **Donner une identité à trois scènes.** Port proche et animé, montée encadrée par de grands repères, envol révélant le phare. Les volumes doivent annoncer le virage ou révéler la suite. Différencier matériaux, architecture, lumière et ambiance sonore. Les thèmes du [catalogue officiel Nintendo](https://www.nintendo.com/sg/switch/aabp/sp/course/index.html) fournissent des références à analyser, notamment Toad Harbor et Sunshine Airport.
3. **Aboutir un pilote et un kart.** Les modèles restent des assemblages de primitives. Travailler un modèle propre, ses proportions, un rig simple, regard, lancer et réactions avant de décliner tous les personnages. Les animations récemment ajoutées sont utiles, mais ne remplacent pas ce travail d’assets.
4. **Régler la caméra par situation.** Conduite, drift, lancement, vol, réception : préserver la lecture du kart et du prochain point de trajectoire. Mesurer son occupation à l’écran et la position de l’horizon sur des captures, puis régler les transitions. Ces propositions restent à vérifier dans le rendu.
5. **Mettre en scène les événements.** Départ avec pilotes prêts, lancer visible, réception, dernier tour, arrivée suivie d’une courte célébration. Synchroniser animation, son et caméra avant d’ouvrir les résultats.

## Lot recommandé

Commencer par une portion de 30 à 45 secondes du circuit actuel comprenant accélération, virage, drift, turbo, glissière et objets. Y intégrer moteur et contacts crédibles, sons d’objets distincts, un concurrent audible en stéréo et une caméra réglée. Étendre ensuite le résultat au vol, au tunnel et au reste de la piste.

Validation proposée : une capture du jeu avec son, une écoute sans image, puis un essai au clavier et avec téléphone. Vérifier aussi reprise après pause, absence de clics aux raccords, variations entre impacts et lisibilité des alertes. Les tests de logique restent nécessaires ; ils ne remplacent pas cette écoute et cet essai humain.

Cet audit ne modifie pas le jeu. Il définit la prochaine passe de production et les points permettant de la juger.
