# main.py
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware  # ✅ CORS
from routers import (
    users,
    projects,
    members,
    iterations,
    works,
    reviews,
    auth,
)  # ← добавили auth
import uvicorn

app = FastAPI(title="Project Review API", version="1.2.0")

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ✅ CORS middleware (обязательно для фронтенда на другом порту)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене: ["http://localhost:5500"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роутеры
app.include_router(auth.router)  # ← новое
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(members.router)
app.include_router(iterations.router)
app.include_router(works.router)
app.include_router(reviews.router)


@app.get("/health")
def health():
    return {"status": "ok", "db": "google_sheets_connected", "auth": "jwt_enabled"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
