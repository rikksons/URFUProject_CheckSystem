# auth.py
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS, AUTH_MODE
from database import db

# 🔐 Хеширование паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(user_id: int, email: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=JWT_EXPIRE_HOURS))
    payload = {"sub": str(user_id), "email": email, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id")
) -> dict:
    """
    Гибкая авторизация:
    - Если AUTH_MODE="jwt" → проверяет Bearer-токен
    - Если AUTH_MODE="x-user-id" → берёт пользователя по заголовку (для тестов)
    """
    
    # 🧪 Режим отладки: берём пользователя по X-User-Id
    if AUTH_MODE == "x-user-id" and x_user_id:
        user = db.find_one("Users", "id", x_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    
    # 🔐 Продакшен-режим: проверяем JWT
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token_data = verify_token(credentials.credentials)
    user = db.find_one("Users", "id", token_data.get("sub"))
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user