"""
Centralized Exception Hierarchy Module.

All routers and services should raise `AppException` subclasses instead of 
using raw `fastapi.HTTPException`. The global exception handler defined in 
`main.py` catches these and returns a uniform JSON response structure:
    {"status": "error", "code": "ERROR_CODE", "message": "Human-readable message"}
"""

class AppException(Exception):
    """
    Base exception class for all custom application errors.
    
    Attributes:
        code (str): A constant string identifier for the error category (e.g., 'UNAUTHORIZED').
        message (str): A localized, human-readable error description sent to the frontend.
        status_code (int): The HTTP status code to return.
    """

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class UnauthorizedException(AppException):
    """Exception raised when authentication fails or is missing (HTTP 401)."""
    
    def __init__(self, message: str = "Non autorisé") -> None:
        super().__init__("UNAUTHORIZED", message, 401)


class SessionExpiredException(AppException):
    """Exception raised when an active memory cache session expires (HTTP 410)."""
    
    def __init__(self) -> None:
        super().__init__(
            "SESSION_EXPIRED",
            "Votre session de données a expiré. Veuillez réimporter votre fichier.",
            410,
        )


class NotFoundException(AppException):
    """Exception raised when a requested resource cannot be found (HTTP 404)."""
    
    def __init__(self, message: str = "Ressource introuvable") -> None:
        super().__init__("NOT_FOUND", message, 404)


class ValidationException(AppException):
    """Exception raised when business rules or payload validations fail (HTTP 400)."""
    
    def __init__(self, message: str) -> None:
        super().__init__("VALIDATION_ERROR", message, 400)


class FileTooLargeException(AppException):
    """Exception raised when an uploaded file exceeds the configured size limit (HTTP 413)."""
    
    def __init__(self) -> None:
        super().__init__(
            "FILE_TOO_LARGE",
            "Le fichier dépasse la limite de 50 Mo.",
            413,
        )


class InvalidFileTypeException(AppException):
    """Exception raised when an uploaded file's extension or MIME type is unsupported (HTTP 415)."""
    
    def __init__(self) -> None:
        super().__init__(
            "INVALID_FILE_TYPE",
            "Seuls les fichiers CSV et XLSX sont autorisés.",
            415,
        )


class RateLimitException(AppException):
    """Exception raised when a client exceeds their API rate quota (HTTP 429)."""
    
    def __init__(self) -> None:
        super().__init__(
            "RATE_LIMITED", 
            "Trop de requêtes. Réessayez dans un instant.", 
            429
        )


class LLMUnavailableException(AppException):
    """Exception raised when an external LLM interpretation service times out or fails (HTTP 503)."""
    
    def __init__(self, message: str = "Le service d'interprétation LLM est actuellement indisponible.") -> None:
        super().__init__(code="LLM_UNAVAILABLE", message=message, status_code=503)
