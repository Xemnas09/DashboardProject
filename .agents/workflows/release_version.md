---
description: Processus de publication (Release) d'une nouvelle version de l'application
---

# Workflow de Release d'une Version

Ce document décrit les étapes obligatoires pour publier une nouvelle version du Dashboard après validation du client. Ce workflow garantit la stabilité, la traçabilité et le déploiement continu du projet.

## 1. Mise à jour de la documentation
- [ ] Remplacer toutes les occurrences de l'ancienne version par la nouvelle dans `README.md` (titre).
- [ ] Mettre à jour la version dans l'initialisation de l'application FastAPI (`dashboard_app/main.py` -> `version="x.y.z"`).
- [ ] Mettre à jour l'historique dans `CHANGELOG.md` en respectant le format Keep a Changelog (Ajouter la nouvelle balise `## [X.Y.Z] - YYYY-MM-DD` avec les sections `### Added`, `### Fixed`, `### Changed`).
- [ ] Vérifier que le fichier `ARCHITECTURE.md` reflète toujours la structure actuelle (mise à jour si de nouveaux modules ou modèles ont été ajoutés).

## 2. Vérification de Qualité (Stability check)
- [ ] S'assurer qu'il n'y a pas de "code spaghetti" : vérifier les dépendances (tout doit passer par `core/`, aucun import circulaire).
- [ ] Ajouter ou vérifier les docstrings sur les fichiers et fonctions qui ont été modifiés.
- [ ] Exécuter toute la suite de tests pour empêcher toute régression inattendue.
  ```bash
  cd dashboard_app
  python -m pytest tests/test_api.py -v
  ```
- [ ] Résoudre toute erreur de test avant de passer à l'étape suivante.

## 3. Déploiement GitHub
- [ ] Ajouter toutes les modifications au stage :
  ```bash
  git add .
  ```
- [ ] Créer un commit de version explicite :
  ```bash
  git commit -m "Release App vX.Y.Z: [Résumé très court des ajouts vitaux]"
  ```
- [ ] Pousser le code vers le dépôt (qui déclenchera potentiellement le CI ou HuggingFace Spaces) :
  ```bash
  # turbo
  git push origin main
  ```

> Note : Sur HuggingFace, l'action `git push` entraînera automatiquement une nouvelle compilation (Building) de l'image Docker du Space.
