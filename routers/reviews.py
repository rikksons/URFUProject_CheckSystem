# routers/reviews.py
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from auth import get_current_user
from database import db
from models import (
    APIResponse, ReviewCreate, ReviewResponse, ReviewerInfo,
    AssignmentCreate, AssignmentItem, AssignedWorkResponse,
    WorkResult, ResultsResponse, WorkAuthor
)
from datetime import datetime
import random
from typing import List

router = APIRouter(prefix="/projects/{project_id}", tags=["Reviews"])

def _review_to_response(review: dict) -> dict:
    reviewer = db.find_one("Users", "id", review.get("reviewer_id"))
    return {
        "work_id": review.get("work_id"),
        "reviewer": ReviewerInfo(
            user_id=reviewer.get("id") if reviewer else review.get("reviewer_id"),
            name=reviewer.get("name", "Unknown") if reviewer else "Unknown"
        ).model_dump(),
        "review": review.get("comment", review.get("review", "")),
        "rating": int(review.get("score", review.get("rating", 0))),
        "created_at": review.get("created_at", datetime.utcnow().isoformat() + "Z")
    }

def _assigned_work_to_response(work: dict, assigned_at: str) -> dict:
    author = db.find_one("Users", "id", work.get("author_id"))
    return {
        "work_id": work.get("id"),
        "title": work.get("title", ""),
        "author": WorkAuthor(
            user_id=author.get("id") if author else work.get("author_id"),
            name=author.get("name", "Unknown") if author else "Unknown"
        ).model_dump(),
        "assigned_at": assigned_at
    }

# === 1. POST /works/{id}/reviews — Оставить отзыв ===
@router.post("/works/{work_id}/reviews", response_model=APIResponse, status_code=201)
def add_review(
    project_id: int, 
    work_id: int, 
     ReviewCreate, 
    user: dict = Depends(get_current_user)
):
    # Проверяем, что работа существует и принадлежит проекту
    work = db.find_one("Works", "id", work_id)
    if not work or work.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Work not found in this project")
    
    # Проверяем, что пользователь имеет право рецензировать (участник проекта)
    is_member = db.find_one("Members", "project_id", project_id)
    if not is_member or not any(
        m.get("user_id") == user["id"] and m.get("status") == "active" 
        for m in db._get_all("Members") if m.get("project_id") == project_id
    ):
        raise HTTPException(status_code=403, detail="Only project members can review")
    
    # Создаём отзыв
    new_id = db.get_next_id("Reviews")
    row = {
        "id": new_id,
        "work_id": work_id,
        "reviewer_id": user["id"],
        "comment": data.review,  # в БД хранится как comment
        "score": data.rating,     # в БД хранится как score
        "created_at": datetime.utcnow().isoformat() + "Z"
    }
    db.append("Reviews", row)
    
    response_data = _review_to_response(row)
    return APIResponse.ok(
        data=response_data,
        message="Review added successfully."
    )

# === 2. POST /assignments — Распределение проверок ===
@router.post("/assignments", response_model=APIResponse)
def create_assignments(
    project_id: int, 
     AssignmentCreate, 
    user: dict = Depends(get_current_user)
):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Только владелец или модератор может распределять
    if user["id"] != project.get("owner_id") and project.get("status") != "active":
        raise HTTPException(status_code=403, detail="Permission denied")
    
    works = [w for w in db._get_all("Works") if w.get("project_id") == project_id and w.get("status") == "pending"]
    members = [m for m in db._get_all("Members") if m.get("project_id") == project_id and m.get("role") in ["reviewer", "leader", "sutener", "gangsta"]]
    
    if not works:
        return APIResponse.ok(message="No pending works to assign.")
    
    if data.assignment_type == "manual" and data.assignments:
        # Ручное распределение
        for item in data.assignments:
            # Проверка: работа и рецензент существуют в проекте
            work = db.find_one("Works", "id", item.work_id)
            reviewer = db.find_one("Users", "id", item.reviewer_id)
            if not work or work.get("project_id") != project_id:
                continue
            if not reviewer or not any(m.get("user_id") == item.reviewer_id for m in members):
                continue
            
            db.append("Assignments", {
                "id": db.get_next_id("Assignments"),
                "project_id": project_id,
                "work_id": item.work_id,
                "assigned_to": item.reviewer_id,
                "status": "pending",
                "assigned_at": datetime.utcnow().isoformat() + "Z"
            })
    else:
        # Авто-распределение: рандомно, без назначения автору его же работы
        reviewers = [m.get("user_id") for m in members]
        if not reviewers:
            raise HTTPException(status_code=400, detail="No available reviewers")
        
        for work in works:
            # Исключаем автора из списка рецензентов
            available = [r for r in reviewers if r != work.get("author_id")]
            if not available:
                available = reviewers  # fallback, если только автор в проекте
            
            reviewer_id = random.choice(available)
            db.append("Assignments", {
                "id": db.get_next_id("Assignments"),
                "project_id": project_id,
                "work_id": work["id"],
                "assigned_to": reviewer_id,
                "status": "pending",
                "assigned_at": datetime.utcnow().isoformat() + "Z"
            })
    
    return APIResponse.ok(message="Assignments distributed successfully.")

# === 3. GET /my-assignments — Мои назначения ===
@router.get("/my-assignments", response_model=APIResponse)
def my_assignments(project_id: int, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Находим все назначения для текущего пользователя
    assignments = [
        a for a in db._get_all("Assignments") 
        if a.get("assigned_to") == user["id"] 
        and a.get("project_id") == project_id
        and a.get("status") != "completed"
    ]
    
    data = []
    for a in assignments:
        work = db.find_one("Works", "id", a.get("work_id"))
        if work and work.get("status") != "deleted":
            data.append(_assigned_work_to_response(work, a.get("assigned_at", datetime.utcnow().isoformat() + "Z")))
    
    return APIResponse.ok(data=data)

# === 4. GET /results — Сводная таблица ===
@router.get("/results", response_model=APIResponse)
def get_results(project_id: int, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    works = [w for w in db._get_all("Works") if w.get("project_id") == project_id and w.get("status") != "deleted"]
    reviews = [r for r in db._get_all("Reviews") if r.get("work_id") in [w["id"] for w in works]]
    
    results = []
    for work in works:
        work_reviews = [r for r in reviews if r.get("work_id") == work["id"]]
        ratings = [int(r.get("score", r.get("rating", 0))) for r in work_reviews]
        
        avg = round(sum(ratings) / len(ratings), 2) if ratings else 0.0
        
        author = db.find_one("Users", "id", work.get("author_id"))
        results.append(WorkResult(
            work_id=work.get("id"),
            title=work.get("title", ""),
            author=WorkAuthor(
                user_id=author.get("id") if author else work.get("author_id"),
                name=author.get("name", "Unknown") if author else "Unknown"
            ),
            average_rating=avg,
            reviews_count=len(ratings)
        ).model_dump())
    
    return APIResponse.ok(data={"project_id": project_id, "results": results})

# === 5. GET /export — Выгрузка данных ===
@router.get("/export")
def export_data(
    project_id: int, 
    format: str = Query("xlsx", regex="^(pdf|xlsx)$"),
    user: dict = Depends(get_current_user)
):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    from services.export import export_project
    
    file_path, media_type, filename = export_project(project_id, format)
    
    return Response(
        content=open(file_path, "rb").read(),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )