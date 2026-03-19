## [0.3.1] - 2026-03-19

### Added
- **HuggingFace Spaces Compatibility** : Ajout du frontmatter YAML (`sdk: docker`) dans le `README.md` pour un déploiement fluide sur HF Spaces.
- **Workflow de Release** : Standardisation du processus de publication de version (`release_version.md`).

### Fixed
- **Clean Architecture (DDD)** : Nettoyage de 9 fichiers morts et obsolètes (routeurs inactifs et configurations racine dupliquées).
- **Stabilité des Imports** : Correction globale des dépendances circulaires ou obsolètes (`models/user.py`, `token_service.py`), forçant le passage par le module `core/`.
- **UI UX Glitch** : Suppression d'un reliquat de code `)}` visible sur la page d'upload.

## [0.3.0] - 2026-03-17

### Added
- **Blindage d'Importation (P1/P2)** : Moteur de lecture résilient avec détection d'encodage (UTF-8/Latin-1) et détection de séparateur (`;`, `,`, `\t`).
- **Supports de Formats Étendus** : Support natif des fichiers **Parquet** (avec lazy loading) et **JSON** (records, NDJSON, columns).
- **Importation URL Sécurisée** : Téléchargement distant avec protection contre le SSRF et limite de taille (50Mo).
- **Nettoyage Automatique** : Suppression des caractères BOM et des espaces insécables dans les noms de colonnes.
- **Résilience Excel/Parquet** : Conversion des erreurs de formules Excel en `null` et aplatissement des types complexes Parquet pour le frontend.

### Fixed
- **Validation Strict** : Détection et rejet propre des fichiers vides ou mal structurés.
- **Optimisation Preview** : Chargement limité à 500 lignes pour les fichiers volumineux.

## [0.2.0] - 2026-03-17

### Added
- **Mode Plein Écran Immersif** : Bascule plein écran pour le tableau et les statistiques.
- **Moteur d'Inférence Sémantique** : Classification intelligente (**NUM**, **CAT**, **ID**) et consolidation automatique des variables discrètes.
- **Sélecteur d'Export PDF** : Interface de sélection des colonnes.

### Fixed
- **Migration AgGrid v31+** : Résolution du crash "Page Blanche".
- **Stabilité Excel** : Moteur de lecture Calamine.

## [0.1.0] - 2026-03-12
### Added
- **Modernisation du Backend** : Migration vers PyJWT et unification du typage (smart casting).
- **Domain-Driven Design** : Refonte de l'architecture pour une meilleure maintenabilité.
- **Stabilité Windows** : Système de sauvegarde atomique contre les verrous de fichiers.
