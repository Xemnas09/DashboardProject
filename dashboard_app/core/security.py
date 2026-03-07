"""
Core Security Module.

Provides cryptographic utilties such as password hashing and verification.
"""
from passlib.context import CryptContext

# ---------------------------------------------------------------------------
# Password Hashing Setup
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """
    Hashes a plaintext password using bcrypt.
    
    Args:
        password (str): The plaintext password.
        
    Returns:
        str: The fully hashed string (including algorithm, cost, salt, and hash).
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plaintext password against a bcrypt hash.
    
    Args:
        plain_password (str): The unhashed password attempt.
        hashed_password (str): The stored bcrypt hash.
        
    Returns:
        bool: True if the password matches the hash, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)
