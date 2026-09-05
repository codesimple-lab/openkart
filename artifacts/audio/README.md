# Vérification du son

`driving-mix.wav` est un rendu stéréo de 26 secondes du **graphe Web Audio du jeu**, avec les 19 WAV livrés. Les entrées de conduite et événements sont programmés pour la comparaison. Ce n'est pas une capture d'une partie jouée au navigateur.

- 0–2 s : ralenti, adversaires proches, ambiance côtière et musique originale.
- 2–5 s : accélération ; 5–7 s : relâchement de l'accélérateur.
- 7–9 s : dérapage et paliers de charge ; 9–11 s : turbo.
- 11–13 s : herbe puis bordure et contact métallique.
- 13–15 s : boîte, roulette puis confirmation.
- 15–20 s : lancement, rebond et casse de carapace, klaxon puis banane.
- 20–22 s : deltaplane puis activation étoile.
- 22–24 s : atterrissage, alerte de carapace ciblée puis impact en tunnel.
- 24–25 s : passage de tour ; 25–26 s : arrêt de la course et extinction des boucles.

`levels.json` mesure les crêtes et RMS à chaque seconde. Rendu validé : aucune valeur non finie, aucun échantillon écrêté, crête environ −7,1 dBFS. Les 15 boucles restent fixes ; aucune voix ponctuelle ne subsiste à la fin de l'extrait. Ces mesures valident le décodage, la génération et la marge du mix. Elles ne remplacent pas une écoute ni la vérification des politiques audio dans Brave/Safari avec une manette téléphone.

Reproduire depuis la racine du projet :

```sh
npm install --prefix /private/tmp/kart-audio-qa node-web-audio-api@1.0.7
node tests/render-audio.mjs /private/tmp/kart-audio-qa/node_modules/node-web-audio-api/index.mjs
```

Le moteur de rendu natif [node-web-audio-api](https://github.com/ircam-ismm/node-web-audio-api) est installé uniquement dans le dossier temporaire. Aucun paquet audio supplémentaire n'est livré dans le jeu. Le script recompile les modules courants avec esbuild puis effectue le rendu hors ligne ; il n'ouvre pas de périphérique audio.
