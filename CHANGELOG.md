## [0.5.0] - 2026-03-28
### Added
- **Refonte Détection d'Anomalies v2.0** : Moteur scientifique complet avec 3 méthodes de détection (Z-Score scipy, IQR Tukey, Isolation Forest + RobustScaler).
- **Router Dédié** : Nouveau `routers/anomalies.py` avec endpoints `POST /api/anomalies/detect` et `POST /api/anomalies/interpret` (interprétation LLM async via Gemini).
- **Réponse Enrichie** : Scores normalisés 0→1, classification de sévérité (Critique/Modéré/Faible), colonnes contributives, score humain (ex: "×4.2 la médiane"), et plages normales (médiane, Q1, Q3).
- **AnomalyConfigModal** : Interface de configuration avec cartes de méthode (recommandation automatique), sélecteur de sensibilité (Strict/Standard/Large), et sélecteur de colonnes.
- **AnomalyResultsModal** : Modal résultats avec en-tête sombre, badges de sévérité, interprétation IA asynchrone (skeleton loader), tableau enrichi avec filtrage par sévérité, export CSV, et bouton "Voir dans la table".

### Improved
- **Séparation Architecturale** : Code anomalie extrait de `database.py` vers un router/service/schema dédié.
- **Modal** : Ajout du prop `noPadding` pour les rendus edge-to-edge.

### Fixed
- **Doublon Endpoint** : Suppression du doublon `GET /api/database/stats` dans `database.py`.
- **Dépendance** : Ajout de `scipy==1.13.0` aux requirements.

## [0.4.2] - 2026-03-20
### Added
- **Moteur Statistique Scientifique (v0.5.x)** : Ajout des indicateurs avancés (Écart-type, Quartiles, Mode, Amplitude) pour une analyse de données rigoureuse.
- **Interprétation Automatique** : Système d'insights dynamiques basé sur les métriques scientifiques (détection d'outliers, asymétrie).

### Improved
- **Smart Chart UX** : Labels prioritaires (Top 10), formatage compact (344k), et zoom adaptatif pour les graphiques haute densité.
- **Restauration de Cohérence** : Préservation des labels booléens d'origine (0/1) et correction des étiquettes "undefined".

## [0.4.1] - 2026-03-20
### Added
- **Moteur Apache Arrow** : Migration vers le format Arrow IPC pour un transfert de données ultra-rapide entre le serveur et le client.
- **Dépollution du Système** : Suppression massive de fichiers temporaires pour un environnement de production sain.

## [0.3.3] - 2026-03-20

### Added
- **Refactorisation DDD Majeure** : Centralisation complète de la logique métier (calculs, statistiques, anomalies) dans `services/data_service.py` pour une maintenance simplifiée.
- **Unification de la Classification** : Le moteur `classify_column` est désormais utilisé universellement par tous les modules pour une cohérence totale des types de données.
- **Optimisation du Cache** : Gestion centralisée du cache RAM et IPC (disque) pour une performance maximale sur les gros volumes.
- **UI UX - Plein Écran** : Ajout d'un mode "Agrandir" pour le modal de statistiques, améliorant la lisibilité des distributions complexes.

### Fixed
- **Correction des Graphiques Temporels** : Restauration de la logique de distribution pour les colonnes `date` et `datetime`, avec correction de la précision des labels (ISO).
- **Allègement des Routeurs** : Réduction massive de la dette technique dans `database.py`, `reports.py` et `dashboard.py` (transformés en contrôleurs fins).
- **Nettoyage du Projet** : Suppression des scripts de test orphelins et des journaux d'erreurs d'initialisation à la racine.

## [0.3.2] - 2026-03-19

### Added
- **Correction du Build Frontend** : Ajout de la dépendance manquante `dompurify` pour résoudre l'échec de compilation Vite (Rollup/jsPDF) sur les environnements CI persistants.
- **Sécurité et Ergonomie d'Importation** : Implémentation d'un React Portal pour l'overlay de chargement, garantissant la neutralisation totale de l'interface (incluant la barre latérale) pendant l'importation locale ou distante.

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
### Fixed
- **Migration AgGrid v31+** : Résolution du crash "Page Blanche".
- **Stabilité Excel** : Moteur de lecture Calamine.

## [0.1.0] - 2026-03-12
### Added
- **Modernisation du Backend** : Migration vers PyJWT et unification du typage (smart casting).
- **Domain-Driven Design** : Refonte de l'architecture pour une meilleure maintenabilité.
- **Stabilité Windows** : Système de sauvegarde atomique contre les verrous de fichiers.
