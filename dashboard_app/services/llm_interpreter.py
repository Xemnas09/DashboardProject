import time
from loguru import logger
import google.generativeai as genai
from settings import settings
from exceptions import LLMUnavailableException

class GeminiInterpreter:
    def __init__(self):
        self.api_key = settings.gemini_api_key
        if self.api_key:
            genai.configure(api_key=self.api_key)
        self.model_name = "gemini-2.5-flash-lite"

    async def interpret_chart(self, chart_type: str, x_column: str, y_column: str | None, summary: dict, language: str) -> str:
        if not self.api_key:
            raise LLMUnavailableException("La clé API Gemini n'est pas configurée sur le serveur.")

        prompt = (
            f"Tu es un analyste de données expert. Interprète les statistiques suivantes d'un diagramme de type {chart_type}. "
            f"L'axe principal représente '{x_column}'"
            f'{f" et l\'axe secondaire représente {y_column}" if y_column else ""}.\n\n'
            f"Statistiques résumées : {summary}\n\n"
            f"Instruction : Rédige une analyse claire, concise et professionnelle (maximum 3 phrases). "
            f"Ne mentionne pas le fait que je t'ai donné un JSON. "
            f"Réponds UNIQUEMENT dans cette langue : {language}."
        )

        model = genai.GenerativeModel(self.model_name)
        
        start_time = time.time()
        try:
            # Synchronous call blocking offloaded implicitly, or just runs fine for this volume
            response = model.generate_content(prompt)
            duration = round((time.time() - start_time) * 1000)
            
            usage = response.usage_metadata
            logger.info(
                f"[Gemini API] Success | Model: {self.model_name} | "
                f"Tokens: Prompt={usage.prompt_token_count}, "
                f"Candidates={usage.candidates_token_count}, "
                f"Total={usage.total_token_count} | Duration: {duration}ms"
            )
            
            return response.text.strip()
            
        except Exception as e:
            duration = round((time.time() - start_time) * 1000)
            logger.error(f"[Gemini API] Failed after {duration}ms | Error: {str(e)}")
            raise LLMUnavailableException()

    async def recommend(self, x_col: str, x_type: str, y_col: str, y_type: str, row_count: int, language: str) -> list[dict]:
        if not self.api_key:
            raise LLMUnavailableException()

        y_text = f"L'axe Y '{y_col}' est de type '{y_type}'." if y_col else "Il n'y a pas d'axe Y sélectionné."
        prompt = (
            f"Tu es un expert en visualisation de données. "
            f"Je souhaite représenter des données. L'axe X '{x_col}' est de type '{x_type}'. "
            f"{y_text} "
            f"Le jeu de données contient {row_count} lignes.\n\n"
            f"Fais exactement 2 recommandations pour le meilleur type de graphique parmi: "
            f"[bar, line, pie, area, scatter, boxplot].\n\n"
            f"La réponse doit être un JSON stricte et valide, contenant une liste de 2 objets "
            f"avec les clés 'chart_type', 'confidence' (high ou medium), et 'reason' (explication dans cette langue: {language}).\n"
            f"N'ajoute aucun markdown de type ```json."
        )

        model = genai.GenerativeModel(self.model_name)
        
        start_time = time.time()
        try:
            response = await model.generate_content_async(prompt, generation_config=genai.GenerationConfig(response_mime_type="application/json"))
            duration = round((time.time() - start_time) * 1000)
            
            usage = response.usage_metadata
            logger.info(
                f"[Gemini API - Recommend] Success | Model: {self.model_name} | "
                f"Tokens: Prompt={usage.prompt_token_count}, "
                f"Total={usage.total_token_count} | Duration: {duration}ms"
            )
            
            import json
            data = json.loads(response.text.strip())
            if isinstance(data, dict) and "recommendations" in data:
                data = data["recommendations"]
            return data[:2]
            
        except Exception as e:
            duration = round((time.time() - start_time) * 1000)
            logger.error(f"[Gemini API - Recommend] Failed after {duration}ms | Error: {str(e)}")
            raise LLMUnavailableException()

llm_interpreter = GeminiInterpreter()
