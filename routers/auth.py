# routers/auth.py
from fastapi import APIRouter, Depends, HTTPException
from auth import get_password_hash, verify_password, create_access_token, get_current_user
from database import db
from models import (
    APIResponse, UserRegister, UserLogin, TokenResponse, 
    UserProfile, APIResponse
)
from datetime import datetime
import uuid

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=APIResponse, status_code=201)
def register( data: UserRegister):
    # Проверяем, не занят ли email
    existing = db.find_one("Users", "email", data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Создаём пользователя
    new_id = db.get_next_id("Users")
    user_row = {
        "id": new_id,
        "email": data.email,
        "password_hash": get_password_hash(data.password),  # 🔐 хешируем!
        "name": data.name,
        "telegramtag": data.telegramtag or "",
        "role": "user",
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    db.append("Users", user_row)
    
    # Генерируем токен
    token = create_access_token(new_id, data.email)
    
    return APIResponse.ok(
        data={
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": new_id,
                "email": data.email,
                "name": data.name,
                "telegramtag": data.telegramtag
            }
        },
        message="Registration successful"
    )

@router.post("/login", response_model=APIResponse)
def login( data: UserLogin):
    user = db.find_one("Users", "email", data.email)
    
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Генерируем токен
    token = create_access_token(user["id"], user["email"])
    
    return APIResponse.ok(
        data={
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "name": user["name"],
                "telegramtag": user.get("telegramtag")
            }
        },
        message="Login successful"
    )

@router.get("/me", response_model=APIResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    """Проверка токена + возврат профиля"""
    return APIResponse.ok(
        data={
            "id": current_user.get("id"),
            "email": current_user.get("email"),
            "name": current_user.get("name"),
            "telegramtag": current_user.get("telegramtag"),
            "role": current_user.get("role"),
            "created_at": current_user.get("created_at")
        }
    )