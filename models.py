# models.py
from pydantic import BaseModel, Field
from typing import Optional, List, Any

# === Общий ответ ===
class APIResponse(BaseModel):
    status: str = "success"
    message: Optional[str] = None
    data: Optional[Any] = None

    @classmethod
    def ok(cls, data: Any = None, message: str = None):
        return cls(status="success", message=message, data=data)

# === Users ===
class UserUpdate(BaseModel):
    name: Optional[str] = None

class UserProfile(BaseModel):
    id: int
    telegramtag: Optional[str] = None
    name: str
    created_at: str

# === Projects ===
class ProjectCreate(BaseModel):
    project_name: str
    description: str
    status: str = "active"

class ProjectJoin(BaseModel):
    project_code: str

class ProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class ProjectResponse(BaseModel):
    id: int
    project_name: str
    description: str
    status: str
    created_at: str
    updated_at: Optional[str] = None

# === Members ===
class MemberResponse(BaseModel):
    user_id: int
    name: str
    role: str
    joined_at: str
    updated_at: Optional[str] = None

class MemberUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None

# === Iterations ===
class IterationCreate(BaseModel):
    name: str
    status: str = "open"

class IterationUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None

class IterationResponse(BaseModel):
    id: int
    name: str
    status: str
    created_at: str
    updated_at: Optional[str] = None

class IterationHistoryItem(BaseModel):
    event_type: str
    timestamp: str
    details: str

class IterationNotify(BaseModel):
    subject: str
    message: str

# === Works ===
class WorkAuthor(BaseModel):
    user_id: int
    name: str

class WorkCreate(BaseModel):
    title: str
    content: str
    iteration_id: Optional[int] = None

class WorkUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    lock: Optional[bool] = None

class WorkResponse(BaseModel):
    id: int
    title: str
    content: Optional[str] = None
    status: str
    author: WorkAuthor
    created_at: str
    updated_at: Optional[str] = None

# === Reviews ===
class ReviewCreate(BaseModel):
    review: str
    rating: int = Field(..., ge=1, le=10)

class ReviewerInfo(BaseModel):
    user_id: int
    name: str

class ReviewResponse(BaseModel):
    work_id: int
    reviewer: ReviewerInfo
    review: str
    rating: int
    created_at: str

# === Assignments & Results ===
class AssignmentItem(BaseModel):
    work_id: int
    reviewer_id: int

class AssignmentCreate(BaseModel):
    assignment_type: str = "auto"
    assignments: Optional[List[AssignmentItem]] = None

class AssignedWorkResponse(BaseModel):
    work_id: int
    title: str
    author: WorkAuthor
    assigned_at: str

class WorkResult(BaseModel):
    work_id: int
    title: str
    author: WorkAuthor
    average_rating: float
    reviews_count: int

class ResultsResponse(BaseModel):
    project_id: int
<<<<<<< HEAD
    results: List[WorkResult]
=======
    results: List[WorkResult]

class UserRegister(BaseModel):
    email: str = Field(..., pattern=r'^[\w\.-]+@[\w\.-]+\.\w+$')  # ← regex → pattern
    password: str = Field(..., min_length=6)
    name: str
    telegramtag: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile  # из предыдущих моделей

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
