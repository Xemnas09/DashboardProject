---
title: Datavera Dashboard
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# Datavera v0.4.2

Datavera est une plateforme moderne d'analyse et d'exploration de données haute performance, conçue pour transformer des fichiers bruts (CSV, Excel) en insights exploitables avec une interface glassmorphic ultra-fluide.

## 🌟 Fonctionnalités Phares

- **Exploration Immersive** : Basculez le tableau de données ou vos graphiques en mode plein écran pour une analyse sans distractions (touche `Echap` supportée).
- **Inférence Sémantique Avancée** : Détection automatique des types de données (**NUM**, **CAT**, **ID**) avec consolidation intelligente des variables discrètes.
- **Gestion Expert des Données** : Créez des variables expertes (champs calculés) et détectez les anomalies statistiques (Isolation Forest, IQR, Z-Score).
- **Multi-Sheet Stable** : Support complet des fichiers Excel multi-feuilles avec moteur de lecture ultra-rapide (Calamine).
- **Exports Professionnels** : Générez des rapports PDF sélectifs, des fichiers CSV ou Excel en un clic.
- **Sécurité Entreprise** : Authentification JWT robuste, RBAC (Contrôle d'accès basé sur les rôles) et WebSockets en temps réel pour le suivi de présence.

## 🚀 Installation Locale

### Prérequis
- Python 3.11+
- Node.js 18+

### 1. Backend (FastAPI)
```bash
cd dashboard_app
python -m venv venv
source venv/bin/activate # Windows: venv\Scripts\activate
pip install -r requirements.txt
python init_db.py # Initialisation du schéma et du super_admin
uvicorn main:app --reload
```

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

## ☁️ Déploiement Hugging Face Spaces

Ce projet est prêt pour un déploiement via Docker sur Hugging Face Spaces.

1. Créez un nouveau **Space** sur Hugging Face.
2. Choisissez le SDK **Docker**.
3. Poussez le code source. Le `Dockerfile` compilera automatiquement le frontend et exposera l'application sur le port **7860**.
4. Configurez vos variables d'environnement (`JWT_SECRET`, etc.) dans les réglages du Space.

## 🧱 Architecture
Le projet suit une approche **Domain-Driven Design (DDD)** pour une maintenabilité maximale. Consultez le fichier [ARCHITECTURE.md](ARCHITECTURE.md) pour plus de détails.

## 📄 Licence
Propriété de Datavera. Tous droits réservés.
