class AIServiceError(Exception):
    """Base exception for expected AI service failures."""


class InvalidLandmarkError(AIServiceError):
    """Raised when landmark data cannot be processed."""
