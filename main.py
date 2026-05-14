# main.py
from fastapi import FastAPI
<<<<<<< HEAD
from routers import users, projects, members, iterations, works, reviews
import uvicorn

# ✅ 1. Сначала создаём приложение
app = FastAPI(title="Project Review API", version="1.1.0")

# ✅ 2. Потом подключаем роутеры
=======
from fastapi.middleware.cors import CORSMiddleware  # ✅ CORS
from routers import users, projects, members, iterations, works, reviews, auth  # ← добавили auth
import uvicorn

app = FastAPI(title="Project Review API", version="1.2.0")

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
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(members.router)
app.include_router(iterations.router)
app.include_router(works.router)
app.include_router(reviews.router)

@app.get("/health")
def health():
<<<<<<< HEAD
    return {"status": "ok", "db": "google_sheets_connected"}
=======
    return {"status": "ok", "db": "google_sheets_connected", "auth": "jwt_enabled"}
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)