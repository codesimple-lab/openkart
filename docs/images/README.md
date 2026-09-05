# Visuels du README

Ces SVG sont des illustrations issues du code actuel, pas des captures d’une course :

- `pilotes.svg` reprend les quatre portraits du sélecteur de personnages.
- `circuit.svg` projette les échantillons du tracé principal de `Course`. Les raccourcis restent masqués.

Après modification des portraits ou du circuit, régénérer depuis la racine :

```sh
node scripts/generate-doc-images.mjs
```

Les SVG n’utilisent ni image distante ni police externe.
