# routers/works.py
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from auth import get_current_user
from database import db
from models import APIResponse, WorkUpdate, WorkResponse, WorkAuthor
from datetime import datetime
import shutil
import os
import uuid

router = APIRouter(tags=["Works"])


def _work_to_response(work: dict) -> dict:
    author = db.find_one("Users", "id", work.get("author_id"))
    # Собираем связанные отзывы и назначенных экспертов, чтобы клиент получил полную картину
    raw_reviews = [
        r for r in db._get_all("Reviews") if r.get("work_id") == work.get("id")
    ]
    reviews = []
    for r in raw_reviews:
        reviewer = db.find_one("Users", "id", r.get("reviewer_id"))
        # Безопасное преобразование рейтинга
        rating_val = r.get("score") or r.get("rating") or 0
        try:
            rating = int(rating_val) if rating_val else 0
        except (ValueError, TypeError):
            rating = 0
        reviews.append(
            {
                "work_id": r.get("work_id"),
                "reviewer": {
                    "user_id": reviewer.get("id") if reviewer else r.get("reviewer_id"),
                    "name": reviewer.get("name", "Unknown") if reviewer else "Unknown",
                },
                "review": r.get("comment", r.get("review", "")),
                "rating": rating,
                "created_at": r.get("created_at"),
            }
        )

    # Назначенные эксперты (по таблице Assignments)
    raw_assigns = [
        a for a in db._get_all("Assignments") if a.get("work_id") == work.get("id")
    ]
    assigned_experts = []
    for a in raw_assigns:
        user_obj = db.find_one("Users", "id", a.get("assigned_to"))
        if user_obj:
            assigned_experts.append(user_obj.get("name"))

    return {
        "id": work.get("id"),
        "title": work.get("title", ""),
        "content": work.get("content", work.get("content_url")),
        "status": work.get("status", "pending"),
        "author_id": work.get("author_id"),
        "author_name": author.get("name", "Unknown") if author else "Unknown",
        "author": WorkAuthor(
            user_id=author.get("id") if author else work.get("author_id"),
            name=author.get("name", "Unknown") if author else "Unknown",
        ).model_dump(),
        "created_at": work.get(
            "submitted_at", work.get("created_at", datetime.utcnow().isoformat() + "Z")
        ),
        "updated_at": work.get("updated_at"),
        "reviews": reviews,
        "assigned_experts": assigned_experts,
    }


# === Список работ проекта ===
@router.get("/projects/{project_id}/works", response_model=APIResponse)
def list_works(
    project_id: int,
    status: str | None = Query(None),
    my_only: bool = Query(False),
    iteration_id: int | None = Query(None),
    user: dict = Depends(get_current_user),
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
@router.post(
    "/projects/{project_id}/works", response_model=APIResponse, status_code=201
)
def submit_work(
    project_id: int,
    title: str | None = Form(None),
    iteration_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: dict = Depends(get_current_user),
):
    project = db.find_one("Projects", "id", project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    content_url = ""
    if file:
        os.makedirs("uploads", exist_ok=True)
        file_extension = (
            file.filename.split(".")[-1]
            if file.filename and "." in file.filename
            else ""
        )
        new_filename = (
            f"{uuid.uuid4().hex}.{file_extension}"
            if file_extension
            else uuid.uuid4().hex
        )
        file_path = f"uploads/{new_filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        content_url = f"/uploads/{new_filename}"

    new_id = db.get_next_id("Works")
    row = {
        "id": new_id,
        "project_id": project_id,
        "iteration_id": iteration_id or "",
        "author_id": user["id"],
        "title": title or (file.filename if file else "Без названия"),
        "content": content_url,
        "status": "pending",
        "lock_by": "",
        "submitted_at": datetime.utcnow().isoformat() + "Z",
    }
    db.append("Works", row)

    response_data = _work_to_response(row)
    return APIResponse.ok(data=response_data, message="Work submitted successfully.")


# === Детали работы (глобальный путь) ===
@router.get("/works/{work_id}", response_model=APIResponse)
def get_work(work_id: int, user: dict = Depends(get_current_user)):
    work = db.find_one("Works", "id", work_id)
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    return APIResponse.ok(data=_work_to_response(work))


# === Обновление работы ===
@router.patch("/works/{work_id}", response_model=APIResponse)
def update_work(work_id: int, data: WorkUpdate, user: dict = Depends(get_current_user)):
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
        data=_work_to_response(updated), message="Work updated successfully."
    )
