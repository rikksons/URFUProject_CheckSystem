# routers/iterations.py
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from database import db
from models import (
    APIResponse, IterationCreate, IterationUpdate, 
    IterationResponse, IterationHistoryItem, IterationNotify
)
from datetime import datetime
import json

router = APIRouter(prefix="/projects/{project_id}/iterations", tags=["Iterations"])

def _iter_to_response(project: dict | None) -> dict:
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    settings = project.get("settings")
    if isinstance(settings, str) and settings:
        try:
            settings = json.loads(settings)
        except json.JSONDecodeError:
            settings = None

    return {
        "id": project.get("id"),
        "title": project.get("project_name", ""),
        "status": project.get("status", "collection"),
        "settings": settings,
        "created_at": project.get("created_at", datetime.utcnow().isoformat() + "Z"),
        "updated_at": project.get("updated_at")
    }

def _log_event(iteration_id: int, event_type: str, details: str, user_id: int):
    """Добавляет запись в лог итерации"""
    db.append("IterationLogs", {
        "id": db.get_next_id("IterationLogs"),
        "iteration_id": iteration_id,
        "action": event_type,
        "user_id": user_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "details": details
    })

@router.get("", response_model=APIResponse)
def list_iterations(project_id: int, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    
    data = [_iter_to_response(project)]
    return APIResponse.ok(data=data)

@router.post("", response_model=APIResponse, status_code=201)
def create_iteration(project_id: int, data: IterationCreate, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")

    updates = {"status": data.status}
    if data.settings is not None:
        updates["settings"] = json.dumps(data.settings.model_dump(exclude_none=True), default=str)

    if updates["status"] != project.get("status"):
        _log_event(project_id, "status_changed", f"Status changed to {updates['status']}", user["id"])

    updated = db.update("Projects", project_id, updates)
    return APIResponse.ok(
        data=_iter_to_response(updated),
        message="Project stage updated successfully."
    )

@router.get("/{it_id}", response_model=APIResponse)
def get_iteration(project_id: int, it_id: int, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    return APIResponse.ok(data=_iter_to_response(project))

@router.patch("/{it_id}", response_model=APIResponse)
def update_iteration(
    project_id: int, 
    it_id: int, 
    data: IterationUpdate, 
    user: dict = Depends(get_current_user)
):
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    updates.pop("title", None)

    if "settings" in updates:
        settings_value = updates.pop("settings")
        if settings_value is not None:
            updates["settings"] = json.dumps(settings_value, default=str)

    if "status" in updates and updates["status"] != project.get("status"):
        _log_event(project_id, "status_changed", f"Status changed to {updates['status']}.", user["id"])

    updated = db.update("Projects", project_id, updates)
    return APIResponse.ok(
        data=_iter_to_response(updated),
        message="Project stage updated successfully."
    )

@router.get("/{it_id}/history", response_model=APIResponse)
def get_iteration_history(project_id: int, it_id: int, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    
    logs = [l for l in db._get_all("IterationLogs") if l.get("iteration_id") == project_id]
    
    # Форматируем под контракт
    data = []
    for log in logs:
        event_type = log.get("action", "unknown")
        if event_type == "created":
            event_type = "created"
        elif event_type == "status_change":
            event_type = "status_changed"
        
        data.append({
            "event_type": event_type,
            "timestamp": log.get("timestamp", datetime.utcnow().isoformat() + "Z"),
            "details": log.get("details", "")
        })
    
    return APIResponse.ok(data=data)

@router.post("/{it_id}/notify", response_model=APIResponse)
def notify_iteration(
    project_id: int, 
    it_id: int, 
    data: IterationNotify, 
    user: dict = Depends(get_current_user)
):
    project = db.find_one("Projects", "id", project_id)
    if not project or project.get("status") == "deleted":
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Здесь интеграция с внешними сервисами (Telegram, Email, Push)
    # Для MVP просто логируем
    _log_event(project_id, "notification_sent", f"Notification: {data.subject}", user["id"])
    
    # В продакшене:
    # from services.notifications import send_to_project_members
    # send_to_project_members(project_id, data.subject, data.message)
    
    return APIResponse.ok(message="Notifications sent successfully.")