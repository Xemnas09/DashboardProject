"""
Anomalies Router — Refonte v2.0

Dedicated router for anomaly detection and LLM interpretation.
"""
from fastapi import APIRouter, Request, Depends
from loguru import logger

from api.auth.schemas import TokenPayload
from core.dependencies import get_current_user, limiter
from core.exceptions import SessionExpiredException
from schemas.anomaly import AnomalyDetectRequest, AnomalyInterpretRequest
from services.anomaly_detector import detect_anomalies
from services.data_service import get_df_for_user
from services.llm_interpreter import llm_interpreter

router = APIRouter(tags=["Anomalies"])


# ---------------------------------------------------------------------------
# POST /api/anomalies/detect
# ---------------------------------------------------------------------------
@router.post("/api/anomalies/detect")
@limiter.limit("20/minute")
async def api_detect_anomalies(
    request: Request,
    body: AnomalyDetectRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager

    entry = await cache_manager.get(user.cache_id)
    if not entry:
        raise SessionExpiredException()

    df = get_df_for_user(entry)

    result = detect_anomalies(
        df=df,
        method=body.method,
        sensitivity=body.sensitivity,
        columns=body.columns,
    )

    logger.info(
        f"[Anomalies] method={body.method} sensitivity={body.sensitivity} "
        f"rows={result['total_rows']} anomalies={result['anomaly_count']}"
    )

    return result


# ---------------------------------------------------------------------------
# POST /api/anomalies/interpret
# ---------------------------------------------------------------------------
@router.post("/api/anomalies/interpret")
@limiter.limit("10/minute")
async def api_interpret_anomalies(
    request: Request,
    body: AnomalyInterpretRequest,
    user: TokenPayload = Depends(get_current_user),
):
    from services.data_cache import cache_manager

    entry = await cache_manager.get(user.cache_id)
    filename = getattr(entry, "filename", "dataset") if entry else "dataset"

    prompt = _build_interpretation_prompt(body, filename)

    try:
        import google.generativeai as genai

        model = genai.GenerativeModel(llm_interpreter.model_name)
        response = await model.generate_content_async(prompt)
        interpretation = response.text.strip()
    except Exception as e:
        logger.warning(f"[Anomalies] LLM interpretation failed: {e}")
        interpretation = "Analyse contextuelle indisponible."

    return {"status": "success", "interpretation": interpretation}


def _build_interpretation_prompt(body: AnomalyInterpretRequest, filename: str) -> str:
    """Builds the contextual LLM prompt from analysis summary."""
    return f"""Tu es un expert en analyse de données. Voici les résultats d'une analyse d'anomalies sur le fichier "{filename}".

Méthode : {body.method_label}
Données : {body.total_rows:,} lignes, {body.col_count} colonnes analysées
Anomalies détectées : {body.anomaly_count} ({body.anomaly_rate:.1%} des données)
Colonnes les plus touchées : {", ".join(body.top_columns)}
Répartition : {body.by_severity.get("high", 0)} critiques, {body.by_severity.get("moderate", 0)} modérées, {body.by_severity.get("low", 0)} faibles

Rédige un paragraphe d'analyse de 3 à 5 phrases qui :
1. Qualifie la situation globale (normal / préoccupant / critique)
2. Identifie les colonnes problématiques et ce que cela signifie concrètement
3. Formule une recommandation d'action claire et accessible

Reste dans le contexte des données du fichier. Évite le jargon technique.
Utilise un ton professionnel mais accessible à un décideur non-technicien.
Réponds directement en français, sans introduction ni titre."""
