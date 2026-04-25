# auth.py
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from fastapi import Depends, HTTPException, Header
from datetime import datetime, timedelta
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from database import db

def create_token(user_id: int | str, telegramtag: str = "") -> str:
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "telegramtag": telegramtag, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
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
        user = db.find_one("Users", "id", x_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    
    # Продакшен режим: JWT
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        token_data = verify_token(token)
        user = db.find_one("Users", "id", token_data.get("sub"))
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    
    raise HTTPException(status_code=401, detail="Authentication required")