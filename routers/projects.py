# routers/projects.py
from fastapi import APIRouter, Depends, HTTPException, Query
from auth import get_current_user
from database import db
from models import ProjectCreate, ProjectJoin, ProjectUpdate, APIResponse, ProjectResponse
import uuid
from datetime import datetime

router = APIRouter(prefix="/projects", tags=["Projects"])

def _project_to_response(project: dict) -> dict:
    return {
        "id": project.get("id"),
        "project_name": project.get("project_name", ""),
        "description": project.get("description", ""),
        "status": project.get("status", "active"),
        "created_at": project.get("created_at", datetime.utcnow().isoformat() + "Z"),
        "updated_at": project.get("updated_at")
    }

@router.get("", response_model=APIResponse)
def list_projects(
    filter: str | None = Query(None, description="filter=active|inactive"),
    search: str | None = Query(None, description="search=keyword"),
    user: dict = Depends(get_current_user)
):
    projects = db._get_all("Projects")
    
    # Фильтрация по статусу
    if filter:
        projects = [p for p in projects if p.get("status") == filter]
    
    # Поиск по названию (регистронезависимый)
    if search:
        search_lower = search.lower()
        projects = [p for p in projects if search_lower in p.get("project_name", "").lower()]
    
    # Исключаем удалённые
    projects = [p for p in projects if p.get("status") != "deleted"]
    
    data = [_project_to_response(p) for p in projects]
    return APIResponse.ok(data=data)

@router.post("", response_model=APIResponse)
def create_project(
<<<<<<< HEAD
     ProjectCreate, 
=======
    data: ProjectCreate,  # <-- ИСПРАВЛЕНО
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
    user: dict = Depends(get_current_user)
):
    new_id = db.get_next_id("Projects")
    project_code = str(uuid.uuid4())[:8].upper()
    
    row = {
        "id": new_id,
        "owner_id": user.get("id"),
<<<<<<< HEAD
        "project_name": data.project_name,
=======
        "project_name": data.project_name,  # теперь data существует
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
        "description": data.description,
        "project_code": project_code,
        "status": data.status,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": None
    }
    db.append("Projects", row)
    
    response_data = _project_to_response(row)
    return APIResponse.ok(
        data=response_data, 
        message="Project created successfully."
    )

@router.post("/join", response_model=APIResponse)
def join_project(
<<<<<<< HEAD
     ProjectJoin, 
=======
    data: ProjectJoin,  # <-- ИСПРАВЛЕНО
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
    user: dict = Depends(get_current_user)
):
    # Ищем проект по project_code
    project = db.find_one("Projects", "project_code", data.project_code)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found or inactive")
    
    # Проверяем, не состоит ли уже
    members = db._get_all("Members")
    if any(m.get("project_id") == project["id"] and m.get("user_id") == user["id"] for m in members):
        return APIResponse.ok(message="Already a member of this project.")
    
    # Добавляем в участники
    db.append("Members", {
        "id": db.get_next_id("Members"),
        "project_id": project["id"],
        "user_id": user["id"],
        "role": "reviewer",
        "status": "active"
    })
    
    return APIResponse.ok(message="Joined project successfully.")

@router.get("/{project_id}", response_model=APIResponse)
def get_project(project_id: int, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    
    return APIResponse.ok(data=_project_to_response(project))

@router.patch("/{project_id}", response_model=APIResponse)
def update_project(
    project_id: int, 
    data: ProjectUpdate, 
    user: dict = Depends(get_current_user)
):
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Маппинг: project_name → project_name (оставляем как есть)
    if "project_name" in updates and "name" in updates:
        updates.pop("name", None)  # убираем дубликат если есть
    
    updated = db.update("Projects", project_id, updates)
    return APIResponse.ok(
        data=_project_to_response(updated),
        message="Project updated successfully."
    )

@router.delete("/{project_id}", response_model=APIResponse)
def delete_project(project_id: int, user: dict = Depends(get_current_user)):
    db.delete("Projects", project_id)
    return APIResponse.ok(message="Project deleted successfully.")