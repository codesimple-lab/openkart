# Validation OpenKart — 6 septembre 2026

La passe actuelle rend les passages discrets et supprime les annonces de conduite répétitives. Vérification finale : **145 tests réussis dans 21 fichiers**, puis **compilation TypeScript et build Vite réussis**. Vite conserve son avertissement de taille pour le lot Three.js.

Cette passe supprime le deltaplane, rétablit une chaussée continue et ajoute deux branches pavées. Les trajectoires, collisions, objets, appuis des pneus et surfaces des branches font l’objet de vérifications spécifiques. Le relais WebSocket a été revérifié pour la publication OpenKart : appairage, commandes simultanées, tirs arrière, appuis brefs, pause, télémétrie, reconnexion et rejet des messages invalides.

## Manette et gyroscope — 6 septembre

Activation des capteurs directement depuis un clic, explication HTTP/HTTPS, calibration stable de 300 ms, projection de la gravité dans le repère de l’écran, zone neutre de 2°, filtre de 65 ms, sensibilités 16°/24°/34° et inversion. Les essais couvrent portrait, paysages gauche/droite, angle circulaire, données absentes, téléphone à plat, bruit au neutre, recalage et perte des mesures. Les événements d’orientation et de permission des tests DOM sont synthétiques ; aucun téléphone physique n’est simulé comme validé.

Huit tests DOM vérifient les appuis simultanés, le relâchement hors bouton, le retour du cache de navigation, une connexion OPEN sans réponse, les permissions acceptées/refusées, l’explication HTTPS et la conversion des événements en commandes analogiques. Une interruption neutralise les commandes ; une demande distincte `suspend` évite qu’une seconde pause automatique relance la course.

Les relais réels passent en HTTP sur 5180 et en HTTPS sur 5181, avec contrôle exclusif, remplacement d’une ancienne connexion par le même identifiant d’onglet, conservation de la nouvelle connexion lors de la fermeture de l’ancienne et reconnexion du poste de jeu. Le test TLS accepte uniquement le certificat local sur loopback lorsque l’option de test est explicite ; aucun réglage de confiance du navigateur ou du système n’a été modifié. L’approbation du certificat et des capteurs sur le téléphone reste manuelle.

## Conduite et objets

Les blocs « ? » partagent désormais leur taille, orientation et position animée entre affichage et détection. Le contact balaie deux volumes orientés (châssis et pilote) au lieu de l’ancien ellipsoïde trop étroit, puis consomme uniquement le premier bloc touché. Régressions : faces/coins, vrais espaces libres, dérive latérale, passage rapide, toutes les rangées en dévers et plusieurs phases de flottement, inventaire plein et réapparition. Le calcul garde l’orientation du kart fixe sur un pas de simulation ; ce sont des volumes simplifiés, pas une collision triangle par triangle. Cette correction a été vérifiée par tests automatisés et compilation, sans nouvel essai manuel dans le navigateur.

Le joueur et les adversaires partagent les mêmes limites de vitesse, accélération, adhérence, pentes et bonus. Les simulations actuelles couvrent trois courses complètes avec les mêmes commandes IA pour tous, ainsi qu’un benchmark de trois courses où le joueur roule sans drift ni objets. Une victoire isolée y reste possible ; ce benchmark ne constitue pas une garantie universelle d’équilibrage.

L’étoile exige un vrai recouvrement des carrosseries orientées. Les chocs différencient tête-à-queue, renversement et poussée. Les carapaces/bananes peuvent être maintenues derrière le kart ; leur position de protection est partagée entre affichage et interception. Un relâchement lance devant ou derrière, y compris après un appui bref reçu entre deux ticks. Une pause ou un choc annule le geste correctement. Les adversaires utilisent les objets selon les cibles et menaces présentes.

Le raccourci intérieur entre 425 et 550 m élargit la glissière de 6,5 m au maximum. Il partage son profil entre surface visible, collision et rebonds. Trois pièces sont regroupées au cœur du passage, sans ligne guidant son entrée. L’herbe ralentit progressivement, tandis que champignon et étoile préservent la vitesse. Les tests vérifient surface, corridor, ralentissement et absence d’intersection avec le terrain triangulé.

Deux passages compacts quittent la route puis la rejoignent : Verger (900–1160 m, décalage maximal +17 m) et Corniche (1370–1630 m, −26 m), largeur 7 m. Leurs panneaux, marquages blancs, légende et tracés de mini-carte ont été supprimés. Des rochers et buissons masquent leur prolongement depuis la route. Les pièces se trouvent à l’intérieur, sans ligne guidant vers l’entrée.

Chaque branche reçoit deux accélérateurs physiques de 2 s, aux fractions .38 et .62, représentés par des bandes au sol. Le joueur et les adversaires ont les mêmes déclencheurs et bonus ; aucun plafond global de vitesse n’a été modifié. Le freinage IA utilise la courbure réelle de la branche. Essais isolés, même pilote et politique de conduite, pads principaux conservés, sans combat : Verger **9,000 → 7,975 s** ; Corniche **8,058 → 7,117 s**. Gain mesuré total : **1,97 s par tour** si les deux passages sont empruntés. Ce résultat dépend de la trajectoire et n’est pas une promesse en course avec adversaires et objets.

Les événements sonores et animations restent actifs ; les textes centraux « CONTACT », « GLISSIÈRE », « BOÎTE RAMASSÉE », « OBJET PRÊT » et les annonces systématiques de turbo/objet ont été retirés. Les annonces de départ, tour et arrivée demeurent. Les noms des passages ne sont plus révélés automatiquement par le secteur du HUD.

## Modèles, caméra et quartier du port

Carrosserie, capot, pontons et aileron emploient des surfaces continues ; pneus arrondis, regard, lancers, réactions et célébration sont animés. Une ombre de contact procédurale complète l’ombre du soleil. Chaque roue dispose désormais d’un appui indépendant, borné à ±0,5 m. Les tests mesurent les sommets des pneus contre le sol : +1,53 à +2,21 cm sur la piste, +1,56 à +2,07 cm sur le Verger et +1,70 à +1,90 cm sur la Corniche, contre jusqu’à 44,6 cm de flottement avant correction.

La caméra accompagne la conduite, le drift et l’arrivée. Le recul compense la courbure du raccourci pour garder une distance réelle cohérente. Tests de projection à 63° : le kart occupe 24,5 % de la hauteur sur la route et 25,0 % dans le raccourci. Le plafond du tunnel ne contraint la caméra que lorsqu’elle se trouve dans son corridor.

La jonction de la Corniche reçoit une ouverture basse dans la paroi de la grotte entre 1557 et 1589 m. Les cristaux obstructifs sont retirés ; la voûte et la paroi opposée restent intactes. Les 2 928 sondes géométriques du kart, pneus et tête compris, ne rencontrent plus cette paroi. Des tests vérifient aussi la conservation du toit et des murs avant/après l’ouverture.

La partie basse de la [référence Instagram fournie](https://www.instagram.com/p/Dc4UM6NKZkJ/) a été consultée dans Chrome. Elle a servi de référence pour la densité architecturale, le sol travaillé et l’échelle du kart dans l’image. Ses paramètres physiques ne sont pas connus et n’ont pas été prétendument reproduits.

Le port comprend désormais 14 îlots à arcades, 4 pavillons, balcons, corniches, lanternes, terrasses et porte à deux tours. Les bâtiments sont fusionnés en 14 lots de rendu. Tests : emprises hors route sur l’ensemble du circuit, géométrie finie, orientation des toits et dégagement de la porte. Les anciens bâtiments et quais en conflit ont été remplacés ; les emprises filtrent aussi arbres, rochers et végétation décorative. La chaussée du port reçoit des pavés avec joints et relief léger.

Inspection réelle dans Safari des deux entrées actuelles : rochers et végétation, absence de panneaux directionnels et de tracés jaunes sur la mini-carte. Les vues figées affichent environ 30 à 60 FPS ; ce chiffre n’est pas un benchmark général. Le nouveau décor des passages est fusionné par matériau pour limiter les appels de rendu. Le jeu peint une première image immédiatement, ainsi qu’après un redimensionnement, pour gérer les rappels d’animation différés de Safari. La toute dernière correction de paroi est validée géométriquement ; sa nouvelle inspection Safari a été refusée par le contrôle automatique en raison d’un onglet privé sans rapport avec le jeu. Aucun essai manuel prolongé ni essai sur téléphone physique n’est revendiqué.

## Audio

19 WAV locaux documentés : moteurs, pneus, vagues et foley. Les événements déclenchent des sons distincts ; adversaires et projectiles sont atténués et placés en stéréo. Le signe du pan est testé contre une vraie projection Three.js pour éviter d’inverser gauche et droite. Les alertes rouges concernent uniquement la cible réelle.

Le graphe Web Audio de la passe précédente a été rendu hors ligne sur 26 s : pic **−7,05 dBFS**, aucun écrêtage, aucune valeur non finie, 15 boucles fixes et aucune voix ponctuelle restante après arrêt. Voir [l’extrait et la procédure](artifacts/audio/README.md), [les mesures](artifacts/audio/levels.json) et [les licences](CREDITS_AUDIO.md). Cela valide le graphe et les fichiers, sans prétendre à une écoute subjective comparative.

## Limites

Le jeu reste un prototype arcade procédural et stylisé, désormais entièrement routier. Aucun essai sur un téléphone physique ni validation du gyroscope n’a été effectué. Les commandes multitactiles et le relais réel sont testés ; les sensations en mains et le mix sur les haut-parleurs de l’utilisateur restent à juger en jouant.
