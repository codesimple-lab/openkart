> Archive du diagnostic avant la refonte Mario Kart. La version actuelle comporte de nouveaux personnages, des décors enrichis, deux emplacements et davantage d’objets. Voir README.md.

# Audit des boîtes et du circuit — 5 septembre 2026

Le circuit est cohérent et jouable, mais Delta Kart reste un prototype de kart arcade stylisé. Il reprend certaines mécaniques de Mario Kart ; son niveau de détail visuel et la richesse de ses objets ne sont pas encore comparables à Mario Kart 8 Deluxe.

## Boîtes corrigées

Avant : l’inventaire se remplissait au passage d’une distance du circuit, quelle que soit la voie du kart. Les cubes visibles n’avaient pas d’état de ramassage et restaient affichés.

Après : les 12 cubes partagent leur position et leur disponibilité avec la simulation. Le contact tient compte de la voie, de la hauteur et du déplacement entre deux mises à jour. Une boîte disparaît au contact, produit des éclats et revient après 2,5 secondes. La roulette dure 0,7 seconde et donne un turbo, une onde ou un bouclier. Un inventaire plein laisse les autres boîtes disponibles. Les adversaires consomment les mêmes boîtes.

L’équipement est lisible dans le HUD et sur le bouton Objet du téléphone. Un bref appui sur E ou un paquet téléphone pressé puis relâché entre deux mises à jour est conservé jusqu’à sa lecture. Un bouton maintenu pendant la roulette ne dépense pas automatiquement l’objet reçu.

## Audit indépendant de la map

Un agent a vérifié le code et exécuté des simulations, sans modifier les fichiers. Mesures : longueur 1 991,12 m ; vol 166,98 m ; tunnel 108,45 m ; rayon minimal environ 16,22 m ; pente maximale environ 19,91°. Aucun croisement accidentel à altitude proche ni retournement de bord détecté. Le dégagement minimal mesuré entre portions non voisines est 41,71 m entre axes, soit environ 24,71 m entre bords après passage à une largeur constante de 17 m.

Corrections réalisées après ses observations :

- Largeur constante de 17 m pour supprimer 36 commutations brutales entre 15 et 17 m.
- Suppression des chocs contre des barrières inexistantes en vol.
- Assistance latérale progressive, resserrée durant les 50 derniers mètres pour rejoindre la zone d’atterrissage.
- Vitesse minimale de vol à 18 m/s pour empêcher le vol stationnaire et la marche arrière aérienne.
- Collisions calculées modulo la longueur du circuit, y compris avec un pilote doublé d’un tour.

Le modèle reste une conduite guidée par le tracé, avec assistance aérienne ; ce n’est pas une simulation physique libre.

## Comparaison avec les références Nintendo

Le [manuel officiel Mario Kart 8](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/wii_u_6/mario_kart_8/ElectronicManual_WiiU_MarioKart8_EN.pdf) décrit le ramassage par contact, le dérapage suivi d’un mini-turbo et le pilotage du deltaplane. Ces principes sont présents dans Delta Kart.

La [présentation officielle Mario Kart 8 Deluxe](https://www.nintendo.com/au/games/nintendo-switch/mario-kart-8-deluxe/) montre des parcours terrestres, aériens, sous-marins et en antigravité, ainsi qu’un inventaire de deux objets. Delta Kart propose une seule piste, un seul emplacement d’objet et trois pouvoirs originaux ; il n’a pas encore de sections sous-marines ou d’antigravité.

Comparaison visuelle effectuée avec les captures officielles du [stade](https://assets.nintendo.eu/image/upload/c_scale,f_auto,q_auto/scr_kart_track1_1.jpg) et de [l’aéroport](https://assets.nintendo.eu/image/upload/c_scale,f_auto,q_auto/scr_kart_track4_1.jpg). Appréciation : les virages, bordures alternées, ponts et cubes flottants évoquent le genre. Les références Nintendo possèdent une densité de décors, une signalétique, des matériaux et des contrastes lumineux bien plus riches. Delta Kart reste plus vide et plus géométrique, avec des personnages peu animés et une palette douce.

Priorités visuelles restantes : donner une identité forte à chaque secteur, ajouter des décors animés et des repères de virage, détailler les personnages et renforcer les effets de vitesse et d’objets. Les captures Nintendo servent de références d’analyse et ne sont pas intégrées au jeu.

## Validation

20 tests automatisés passent, comprenant une course complète de trois tours, le ramassage, la roulette, les trois pouvoirs, les appuis brefs, les collisions et les atterrissages aux deux extrêmes de direction. Compilation de production et relais WebSocket vérifiés. Le relais teste aussi l’état d’inventaire, la roulette et les pressions/relâchements du bouton Objet.

Vérification dans Brave : cubes « ? » visibles, équipement obtenu après traversée et utilisation du turbo par un appui bref sur E, avec inventaire vidé et turbo actif. Le scénario `/?boxes=1`, disponible uniquement en développement, place le kart en mouvement devant la première rangée pour reproduire ce parcours. L’usage sur un téléphone physique et le gyroscope ne sont pas validés par cette session.
