"""
Encryption service for sensitive data like cloud credentials
"""
from cryptography.fernet import Fernet
import os
import base64
from hashlib import sha256

class EncryptionService:
    def __init__(self):
        # Get encryption key from environment or generate one
        key = os.getenv('ENCRYPTION_KEY')
        if not key:
            # Generate key from a combination of environment-specific values
            # In production, use a proper secrets management system
            db_password = os.getenv('DB_PASSWORD', 'default_key_change_me')
            app_secret = os.getenv('SECRET_KEY', 'default_secret_change_me')
            combined = f"{db_password}:{app_secret}".encode()
            key_bytes = sha256(combined).digest()
            key = base64.urlsafe_b64encode(key_bytes)
        else:
            key = key.encode()

        self.cipher = Fernet(key)

    def encrypt(self, plain_text: str) -> str:
        """Encrypt a string and return base64 encoded encrypted data"""
        if not plain_text:
            return ""
        encrypted = self.cipher.encrypt(plain_text.encode())
        return base64.urlsafe_b64encode(encrypted).decode()

    def decrypt(self, encrypted_text: str) -> str:
        """Decrypt base64 encoded encrypted data and return plain text"""
        if not encrypted_text:
            return ""
        try:
            encrypted_bytes = base64.urlsafe_b64decode(encrypted_text.encode())
            decrypted = self.cipher.decrypt(encrypted_bytes)
            return decrypted.decode()
        except Exception as e:
            raise ValueError(f"Decryption failed: {str(e)}")

# Singleton instance
_encryption_service = None

def get_encryption_service() -> EncryptionService:
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service
