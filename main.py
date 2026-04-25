# main.py
from fastapi import FastAPI
from routers import users, projects, members, iterations, works, reviews
import uvicorn

# ✅ 1. Сначала создаём приложение
app = FastAPI(title="Project Review API", version="1.1.0")

# ✅ 2. Потом подключаем роутеры
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(members.router)
app.include_router(iterations.router)
app.include_router(works.router)
app.include_router(reviews.router)

@app.get("/health")
def health():
    return {"status": "ok", "db": "google_sheets_connected"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)