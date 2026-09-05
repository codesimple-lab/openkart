# Sources des sons

Les sons tiers ci-dessous ont été téléchargés et intégrés le 5 septembre 2026. Aucun son ni musique de Nintendo n'est distribué. Les crédits sont également accessibles dans le jeu à `/audio/CREDITS.txt` ; les empreintes SHA-256 et caractéristiques des fichiers livrés figurent dans `/audio/manifest.json`.

| Fichier livré dans `public/audio` | Œuvre, auteur et source | Licence retenue | Adaptation |
| --- | --- | --- | --- |
| `engine-idle.wav` | [racing car engine sound loops — domasx2](https://opengameart.org/content/racing-car-engine-sound-loops), fichier `loop_0.wav`, extrait par l'auteur d'un enregistrement public-domain de pdsounds.org | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Conversion PCM 16 bits mono 44,1 kHz. Utilisation comme couche grave ; variation de vitesse et filtrage à l'exécution. |
| `engine-load.wav` | [Car Engine Loop 96kHz, 4s — qubodup](https://opengameart.org/content/car-engine-loop-96khz-4s), archive `engine-loop.7z`, fichier `engine-loop-1-normalized.wav` | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Conversion stéréo vers mono PCM 16 bits 44,1 kHz. Boucle enregistrée de 4 s ; hauteur, volume et filtre modulés en jeu. |
| `tyres.wav` | [Car tire squeal skid loop — audible-edge (Tom Haigh), boucle éditée par qubodup](https://opengameart.org/content/car-tire-squeal-skid-loop), fichier `tires_squal_loop.wav` | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Rééchantillonnage 96 → 44,1 kHz, PCM 16 bits. Volume piloté par glissement et vitesse. |
| `waves.wav` | [Beach Ocean Waves — jasinski, extrait préparé par qubodup](https://opengameart.org/content/beach-ocean-waves), fichier `wave_01_cc0-18363__jasinski__alkaibeach.flac`, provenant de Freesound 18363 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Conversion PCM 16 bits stéréo 32 kHz. Raccord en fondu de 160 ms pour une boucle de 3,84 s, volume modulé dans les secteurs côtiers. |
| `metal-1.wav`, `metal-2.wav`, `metal-3.wav` | [Impact Sounds — Kenney](https://kenney.nl/assets/impact-sounds), `impactMetal_heavy_000/001/002.ogg` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Conversion PCM 16 bits mono 44,1 kHz ; impacts de glissière avec variation. |
| `chassis-1.wav`, `chassis-2.wav`, `chassis-3.wav` | Même pack Kenney, `impactPunch_heavy_000/001/002.ogg` | CC0 1.0 | Conversion identique ; couche sourde de carrosserie et d'atterrissage. Ces foley ne sont pas des enregistrements de crash automobile. |
| `shell-1.wav`, `shell-2.wav`, `shell-3.wav` | Même pack Kenney, `impactPlate_medium_000/001/002.ogg` | CC0 1.0 | Conversion identique ; rebonds d'objets et protection. |
| `wood-1.wav`, `wood-2.wav` | Même pack Kenney, `impactWood_medium_000/001.ogg` | CC0 1.0 | Conversion identique ; couche courte de vibration des bordures. |
| `grass-1.wav`, `grass-2.wav` | Même pack Kenney, `footstep_grass_000/001.ogg` | CC0 1.0 | Conversion identique ; texture de contact hors piste, associée au bruit de roulement synthétique. |
| `box.wav` | Même pack Kenney, `impactGlass_heavy_000.ogg` | CC0 1.0 | Conversion identique ; éclat de boîte et casse d'objet. |
| `cloth.wav` | Même pack Kenney, `impactSoft_heavy_000.ogg` | CC0 1.0 | Conversion identique ; mouvement de pilote, déploiement et manipulation. |

La licence originale du pack Kenney est conservée dans `public/audio/KENNEY_LICENSE.txt`.

## Sons originaux du projet

Les notes de pièce, roulette, alerte de carapace, paliers de drift, étoile, départ, passage de tour, le klaxon harmonisé et la musique rythmique sont composés/synthétisés dans `src/game/audio.ts`. Vent, souffle de turbo, sifflement des projectiles, roulement de fond et frottement continu sont du bruit filtré synthétique. La réponse de réverbération du tunnel est calculée. Ces sons ne sont pas présentés comme des enregistrements réels.

## Limites et validation

Le moteur mélange deux enregistrements de voitures existants. Ce n'est pas une banque enregistrée sur le kart du jeu avec des prises distinctes à chaque régime et charge : la charge est représentée par le mélange, le filtre et la vitesse de lecture. Le timbre répond à l'accélérateur même à vitesse identique. La petite musique originale reste synthétique ; ce n'est pas une orchestration enregistrée ni une reproduction de Mario Kart.

Les fichiers ont été décodés et contrôlés (durée, format, empreinte). Les tests couvrent le lien charge/régime, le placement gauche/droite et l'alerte réservée à la cible réelle. Une écoute comparative en course reste nécessaire pour régler les volumes et juger le rendu subjectif.
