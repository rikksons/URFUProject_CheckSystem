# auth.py
<<<<<<< HEAD
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from fastapi import Depends, HTTPException, Header
from datetime import datetime, timedelta
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from database import db

def create_token(user_id: int | str, telegramtag: str = "") -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "telegramtag": telegramtag, "exp": expire}
=======
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
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
<<<<<<< HEAD
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(
    authorization: str | None = Header(None),
    x_user_id: str | None = Header(None)  # MVP mode
) -> dict:
    # Режим разработки: берём пользователя по X-User-Id
    if x_user_id and not authorization:
=======
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
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
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
        user = db.find_one("Users", "id", x_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    
<<<<<<< HEAD
    # Продакшен режим: JWT
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        token_data = verify_token(token)
        user = db.find_one("Users", "id", token_data.get("sub"))
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    
    raise HTTPException(status_code=401, detail="Authentication required")
=======
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
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
