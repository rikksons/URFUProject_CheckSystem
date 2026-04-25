# routers/iterations.py
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from database import db
from models import (
    APIResponse, IterationCreate, IterationUpdate, 
    IterationResponse, IterationHistoryItem, IterationNotify
)
from datetime import datetime
import uuid

router = APIRouter(prefix="/projects/{project_id}/iterations", tags=["Iterations"])

def _iter_to_response(it: dict) -> dict:
    return {
        "id": it.get("id"),
        "name": it.get("title", it.get("name", "")),
        "status": it.get("status", "open"),
        "created_at": it.get("created_at", datetime.utcnow().isoformat() + "Z"),
        "updated_at": it.get("updated_at")
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
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    iterations = [i for i in db._get_all("Iterations") if i.get("project_id") == project_id]
    data = [_iter_to_response(it) for it in iterations]
    return APIResponse.ok(data=data)

@router.post("", response_model=APIResponse, status_code=201)
def create_iteration(project_id: int,  IterationCreate, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    new_id = db.get_next_id("Iterations")
    row = {
        "id": new_id,
        "project_id": project_id,
        "title": data.name,  # в БД хранится как title
        "status": data.status,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "created_by": user["id"]
    }
    db.append("Iterations", row)
    
    # Лог: создание
    _log_event(new_id, "created", f"Iteration '{data.name}' created.", user["id"])
    
    response_data = _iter_to_response(row)
    return APIResponse.ok(
        data=response_data,
        message="Iteration created successfully."
    )

@router.get("/{it_id}", response_model=APIResponse)
def get_iteration(project_id: int, it_id: int, user: dict = Depends(get_current_user)):
    it = db.find_one("Iterations", "id", it_id)
    if not it or it.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Iteration not found")
    return APIResponse.ok(data=_iter_to_response(it))

@router.patch("/{it_id}", response_model=APIResponse)
def update_iteration(
    project_id: int, 
    it_id: int, 
     IterationUpdate, 
    user: dict = Depends(get_current_user)
):
    it = db.find_one("Iterations", "id", it_id)
    if not it or it.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Iteration not found")
    
    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    
    # Маппинг: name → title
    if "name" in updates:
        updates["title"] = updates.pop("name")
    
    # Если меняется статус — логируем
    if "status" in updates and updates["status"] != it.get("status"):
        _log_event(it_id, "status_changed", f"Status changed to {updates['status']}.", user["id"])
    
    updated = db.update("Iterations", it_id, updates)
    return APIResponse.ok(
        data=_iter_to_response(updated),
        message="Iteration updated successfully."
    )

@router.get("/{it_id}/history", response_model=APIResponse)
def get_iteration_history(project_id: int, it_id: int, user: dict = Depends(get_current_user)):
    it = db.find_one("Iterations", "id", it_id)
    if not it or it.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Iteration not found")
    
    logs = [l for l in db._get_all("IterationLogs") if l.get("iteration_id") == it_id]
    
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
     IterationNotify, 
    user: dict = Depends(get_current_user)
):
    it = db.find_one("Iterations", "id", it_id)
    if not it or it.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Iteration not found")
    
    # Здесь интеграция с внешними сервисами (Telegram, Email, Push)
    # Для MVP просто логируем
    _log_event(it_id, "notification_sent", f"Notification: {data.subject}", user["id"])
    
    # В продакшене:
    # from services.notifications import send_to_project_members
    # send_to_project_members(project_id, data.subject, data.message)
    
    return APIResponse.ok(message="Notifications sent successfully.")