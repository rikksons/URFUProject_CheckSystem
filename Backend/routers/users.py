# routers/users.py
from fastapi import APIRouter, Depends, Header
from auth import get_current_user
from database import db
from models import UserUpdate, APIResponse, UserProfile
from datetime import datetime

router = APIRouter(prefix="/me", tags=["Users"])

@router.get("", response_model=APIResponse)
def get_profile(user: dict = Depends(get_current_user)):
    data = UserProfile(
        id=user.get("id"),
        telegramtag=user.get("telegramtag"),
        name=user.get("name", ""),
        created_at=user.get("created_at", datetime.utcnow().isoformat() + "Z")
    )
    return APIResponse.ok(data=data.model_dump())

@router.patch("", response_model=APIResponse)
def update_profile(
     UserUpdate, 
    user: dict = Depends(get_current_user),
    x_user_id: str | None = Header(None)
):
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if not updates:
        return APIResponse.ok(data=user, message="No changes provided")
    
    updated = db.update("Users", user["id"], updates)
    return APIResponse.ok(
        data={"name": updated.get("name")}, 
        message="User profile updated successfully."
    )