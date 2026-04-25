# routers/members.py
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from database import db
from models import APIResponse, MemberUpdate, MemberResponse
from datetime import datetime

router = APIRouter(prefix="/projects/{project_id}/members", tags=["Members"])

def _member_to_response(member: dict, user_info: dict = None) -> dict:
    return {
        "user_id": member.get("user_id"),
        "name": user_info.get("name", "") if user_info else member.get("name", ""),
        "role": member.get("role", "reviewer"),
        "joined_at": member.get("created_at", member.get("joined_at", datetime.utcnow().isoformat() + "Z"))
    }

@router.get("", response_model=APIResponse)
def list_members(project_id: int, user: dict = Depends(get_current_user)):
    # Проверяем доступ к проекту
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Проверяем, что пользователь — участник (или админ)
    members = db._get_all("Members")
    if user["id"] != project.get("owner_id"):
        is_member = any(m.get("project_id") == project_id and m.get("user_id") == user["id"] for m in members)
        if not is_member:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Фильтруем участников проекта
    project_members = [m for m in members if m.get("project_id") == project_id and m.get("status") != "deleted"]
    
    # Подтягиваем имена из Users
    users = {u["id"]: u for u in db._get_all("Users")}
    data = [_member_to_response(m, users.get(m.get("user_id"))) for m in project_members]
    
    return APIResponse.ok(data=data)

@router.patch("/{user_id}", response_model=APIResponse)
def update_member(
    project_id: int, 
    user_id: int, 
     MemberUpdate, 
    current_user: dict = Depends(get_current_user)
):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Только владелец проекта может менять роли
    if current_user["id"] != project.get("owner_id"):
        raise HTTPException(status_code=403, detail="Only project owner can manage members")
    
    # Находим запись в Members
    member = db.find_one("Members", "project_id", project_id)
    if not member or member.get("user_id") != user_id:
        # Ищем точнее
        all_members = db._get_all("Members")
        member = next((m for m in all_members if m.get("project_id") == project_id and m.get("user_id") == user_id), None)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found in this project")
    
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    updated = db.update("Members", member["id"], updates)
    
    # Подтягиваем имя
    user_info = db.find_one("Users", "id", user_id)
    response_data = _member_to_response(updated, user_info)
    
    return APIResponse.ok(
        data=response_data,
        message="Member updated successfully."
    )

@router.delete("/{user_id}", response_model=APIResponse)
def remove_member(project_id: int, user_id: int, current_user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Удалить может только владелец, или пользователь может выйти сам
    if current_user["id"] != project.get("owner_id") and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Ищем запись
    all_members = db._get_all("Members")
    member = next((m for m in all_members if m.get("project_id") == project_id and m.get("user_id") == user_id), None)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Soft delete
    db.update("Members", member["id"], {"status": "deleted"})
    return APIResponse.ok(message="Member removed successfully.")