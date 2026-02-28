"""
Centralized exception hierarchy.
All routers raise AppException subclasses — never raw HTTPException.
The global handler in main.py catches them and returns a uniform JSON response:
    {"status": "error", "code": "ERROR_CODE", "message": "Human-readable message"}
"""


class AppException(Exception):
    """Base exception for all application errors."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Non autorisé"):
        super().__init__("UNAUTHORIZED", message, 401)


class SessionExpiredException(AppException):
    def __init__(self):
        super().__init__(
            "SESSION_EXPIRED",
            "Votre session de données a expiré. Veuillez réimporter votre fichier.",
            410,
        )


class NotFoundException(AppException):
    def __init__(self, message: str = "Ressource introuvable"):
        super().__init__("NOT_FOUND", message, 404)


class ValidationException(AppException):
    def __init__(self, message: str):
        super().__init__("VALIDATION_ERROR", message, 400)


class FileTooLargeException(AppException):
    def __init__(self):
        super().__init__(
            "FILE_TOO_LARGE",
            "Le fichier dépasse la limite de 50 Mo.",
            413,
        )


class InvalidFileTypeException(AppException):
    def __init__(self):
        super().__init__(
            "INVALID_FILE_TYPE",
            "Seuls les fichiers CSV et XLSX sont autorisés.",
            415,
        )


class RateLimitException(AppException):
    def __init__(self):
        super().__init__("RATE_LIMITED", "Trop de requêtes. Réessayez dans un instant.", 429)
