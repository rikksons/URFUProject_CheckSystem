# routers/works.py
from fastapi import APIRouter, Depends, HTTPException, Query
from auth import get_current_user
from database import db
from models import (
    APIResponse, WorkCreate, WorkUpdate, 
    WorkResponse, WorkAuthor
)
from datetime import datetime

router = APIRouter(tags=["Works"])

def _work_to_response(work: dict) -> dict:
    author = db.find_one("Users", "id", work.get("author_id"))
    return {
        "id": work.get("id"),
        "title": work.get("title", ""),
        "content": work.get("content", work.get("content_url")),
        "status": work.get("status", "pending"),
        "author": WorkAuthor(
            user_id=author.get("id") if author else work.get("author_id"),
            name=author.get("name", "Unknown") if author else "Unknown"
        ).model_dump(),
        "created_at": work.get("submitted_at", work.get("created_at", datetime.utcnow().isoformat() + "Z")),
        "updated_at": work.get("updated_at")
    }

# === Список работ проекта ===
@router.get("/projects/{project_id}/works", response_model=APIResponse)
def list_works(
    project_id: int,
    status: str | None = Query(None),
    my_only: bool = Query(False),
    iteration_id: int | None = Query(None),
    user: dict = Depends(get_current_user)
):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    works = [w for w in db._get_all("Works") if w.get("project_id") == project_id]
    
    # Фильтры
    if status:
        works = [w for w in works if w.get("status") == status]
    if my_only:
        works = [w for w in works if w.get("author_id") == user["id"]]
    if iteration_id:
        works = [w for w in works if w.get("iteration_id") == iteration_id]
    
    # Исключаем удалённые
    works = [w for w in works if w.get("status") != "deleted"]
    
    data = [_work_to_response(w) for w in works]
    return APIResponse.ok(data=data)

# === Создать работу ===
@router.post("/projects/{project_id}/works", response_model=APIResponse, status_code=201)
def submit_work(project_id: int,  WorkCreate, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    new_id = db.get_next_id("Works")
    row = {
        "id": new_id,
        "project_id": project_id,
        "iteration_id": data.iteration_id or "",
        "author_id": user["id"],
        "title": data.title,
        "content": data.content,
        "status": "pending",
        "lock_by": "",
        "submitted_at": datetime.utcnow().isoformat() + "Z"
    }
    db.append("Works", row)
    
    response_data = _work_to_response(row)
    return APIResponse.ok(
        data=response_data,
        message="Work submitted successfully."
    )

# === Детали работы (глобальный путь) ===
@router.get("/works/{work_id}", response_model=APIResponse)
def get_work(work_id: int, user: dict = Depends(get_current_user)):
    work = db.find_one("Works", "id", work_id)
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    return APIResponse.ok(data=_work_to_response(work))

# === Обновление работы ===
@router.patch("/works/{work_id}", response_model=APIResponse)
def update_work(work_id: int,  WorkUpdate, user: dict = Depends(get_current_user)):
    work = db.find_one("Works", "id", work_id)
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    # Проверка прав: только автор или владелец проекта
    project = db.find_one("Projects", "id", work.get("project_id"))
    is_author = work.get("author_id") == user["id"]
    is_owner = project.get("owner_id") == user["id"] if project else False
    
    if not is_author and not is_owner:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    
    # Обработка lock: если lock=True → status="locked"
    if updates.get("lock") is True:
        updates["status"] = "locked"
        updates.pop("lock", None)
    
    updated = db.update("Works", work_id, updates)
    return APIResponse.ok(
        data=_work_to_response(updated),
        message="Work updated successfully."
    )