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
from pydantic import BaseModel

class ProjectCodeUpdate(BaseModel):
    project_code: str

router = APIRouter(prefix="/projects/{project_id}", tags=["Reviews"])

def _review_to_response(review: dict) -> dict:
    reviewer = db.find_one("Users", "id", review.get("reviewer_id"))
    # Безопасное преобразование рейтинга
    rating_val = review.get("score") or review.get("rating") or 0
    try:
        rating = int(rating_val) if rating_val else 0
    except (ValueError, TypeError):
        rating = 0
    return {
        "work_id": review.get("work_id"),
        "reviewer": ReviewerInfo(
            user_id=reviewer.get("id") if reviewer else review.get("reviewer_id"),
            name=reviewer.get("name", "Unknown") if reviewer else "Unknown"
        ).model_dump(),
        "review": review.get("comment", review.get("review", "")),
        "rating": rating,
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


# === Управление кодом проекта ===
@router.get("/code", response_model=APIResponse)
def get_project_code(project_id: int, user: dict = Depends(get_current_user)):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return APIResponse.ok(data={"code": project.get("project_code", "")})

@router.patch("/code", response_model=APIResponse)
def update_project_code(
    project_id: int, 
    data: ProjectCodeUpdate, 
    user: dict = Depends(get_current_user)
):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if user["id"] != project.get("owner_id"):
        raise HTTPException(status_code=403, detail="Permission denied. Only project owner can update code.")
        
    db.update("Projects", project_id, {"project_code": data.project_code})
    return APIResponse.ok(message="Code updated successfully.")


# === 1. POST /works/{id}/reviews — Оставить отзыв ===
@router.post("/works/{work_id}/reviews", response_model=APIResponse, status_code=201)
def add_review(
    project_id: int,
    work_id: int,
    data: ReviewCreate,
    user: dict = Depends(get_current_user)
):
    # Проверяем, что работа существует и принадлежит проекту
    work = db.find_one("Works", "id", work_id)
    if not work or work.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Work not found in this project")
    
    # Проверяем, что пользователь имеет право рецензировать
    active_member = any(
        m.get("user_id") == user["id"] and str(m.get("project_id")) == str(project_id) and m.get("status") == "active"
        for m in db._get_all("Members")
    )

    # Для P2P: пользователь может быть допущен к проверкам, если он загрузил свою работу в проект
    has_submitted_work = any(
        str(w.get("project_id")) == str(project_id) and w.get("author_id") == user["id"]
        for w in db._get_all("Works")
    )

    if not active_member and not has_submitted_work:
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
    db.update("Works", work_id, {"status": "success"})
    
    response_data = _review_to_response(row)
    return APIResponse.ok(
        data=response_data,
        message="Review added successfully."
    )

# === Сброс проверок для работы ===
@router.post("/works/{work_id}/reset", response_model=APIResponse)
def reset_work_reviews(
    project_id: int,
    work_id: int,
    user: dict = Depends(get_current_user)
):
    """
    Сбрасывает все проверки для одной работы, удаляя отзывы
    и возвращая назначения в статус 'pending'.
    """
    # 1. Проверка прав (только владелец проекта)
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if user["id"] != project.get("owner_id"):
        raise HTTPException(status_code=403, detail="Permission denied. Only project owner can reset reviews.")

    # 2. Проверка существования работы
    work = db.find_one("Works", "id", work_id)
    if not work or work.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Work not found in this project")

    # 3. Находим все отзывы для этой работы
    reviews_to_delete = [r for r in db._get_all("Reviews") if r.get("work_id") == work_id]
    if not reviews_to_delete:
        db.update("Works", work_id, {"status": "pending"})
        return APIResponse.ok(message="No reviews found. Work status has been reset to pending.")

    all_assignments = db._get_all("Assignments")
    deleted_count = 0
    
    # 4. Для каждого отзыва: сбрасываем назначение и удаляем отзыв
    for review in reviews_to_delete:
        reviewer_id = review.get("reviewer_id")
        
        assignment_to_reset = next((
            a for a in all_assignments 
            if a.get("work_id") == work_id and a.get("assigned_to") == reviewer_id
        ), None)

        if assignment_to_reset:
            db.update("Assignments", assignment_to_reset["id"], {"status": "pending"})

        if db.hard_delete_row("Reviews", review["id"]):
            deleted_count += 1

    if deleted_count > 0:
        db.update("Works", work_id, {"status": "pending"})

    return APIResponse.ok(message=f"Reset {deleted_count} review(s). Assignments have been reopened.")

# === Сброс ВСЕХ проверок в проекте ===
@router.post("/reset-all", response_model=APIResponse)
def reset_all_project_reviews(
    project_id: int,
    user: dict = Depends(get_current_user)
):
    """
    Сбрасывает все проверки для ВСЕХ работ в проекте.
    Удаляет все отзывы и возвращает все назначения в статус 'pending'.
    """
    # 1. Проверка прав (только владелец проекта)
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if user["id"] != project.get("owner_id"):
        raise HTTPException(status_code=403, detail="Permission denied. Only project owner can reset reviews.")

    # 2. Находим все работы в проекте
    works_in_project = [w for w in db._get_all("Works") if w.get("project_id") == project_id and w.get("status") != "deleted"]
    if not works_in_project:
        return APIResponse.ok(message="No works found in this project to reset.")

    all_reviews = db._get_all("Reviews")
    all_assignments = db._get_all("Assignments")
    
    total_deleted_reviews = 0
    
    # 3. Итерируемся по каждой работе
    for work in works_in_project:
        work_id = work.get("id")
        reviews_to_delete = [r for r in all_reviews if r.get("work_id") == work_id]
        
        for review in reviews_to_delete:
            reviewer_id = review.get("reviewer_id")
            assignment_to_reset = next((
                a for a in all_assignments 
                if a.get("work_id") == work_id and a.get("assigned_to") == reviewer_id
            ), None)
            if assignment_to_reset:
                db.update("Assignments", assignment_to_reset["id"], {"status": "pending"})
            if db.hard_delete_row("Reviews", review["id"]):
                total_deleted_reviews += 1
        
        if work.get("status") != "pending":
            db.update("Works", work_id, {"status": "pending"})

    return APIResponse.ok(message=f"Reset completed. {total_deleted_reviews} review(s) deleted. All assignments have been reopened.")

# === 2. POST /assignments — Распределение проверок ===
@router.post("/assignments", response_model=APIResponse)
def create_assignments(
    project_id: int, 
    data: AssignmentCreate,
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
    format: str = Query("xlsx", pattern="^(pdf|xlsx)$"),
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