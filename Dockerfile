# ── Étape 1 : Build du frontend React ──
FROM node:18 AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Étape 2 : Backend FastAPI ──
FROM python:3.11-slim

WORKDIR /app

# Dépendances système
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Dépendances Python
COPY dashboard_app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code backend
COPY dashboard_app/ .

# Dossier uploads
RUN mkdir -p uploads

# Fichiers statiques du build React
COPY --from=frontend-build /app/frontend/dist ./static

# HuggingFace impose le port 7860
EXPOSE 7860

# Démarrage via le script entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
