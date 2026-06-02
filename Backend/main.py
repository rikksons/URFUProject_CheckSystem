import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
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


def get_ngrok_token():
    token = os.environ.get("NGROK_AUTHTOKEN")
    if token:
        return token

    credentials_path = Path(__file__).resolve().parent / "credentials.json"
    if not credentials_path.exists():
        return None

    try:
        with credentials_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data.get("NGROK_AUTHTOKEN")
    except Exception as exc:
        print(f"⚠️ Ошибка чтения {credentials_path}: {exc}", file=sys.stderr)
        return None


def launch_proxy_services():
    """Запускает proxy: serveo и ngrok."""
    proxy_commands = [
        ("serveo", ["ssh", "-R", "80:localhost:8000", "serveo.net"]),
    ]

    ngrok_token = get_ngrok_token()
    if ngrok_token:
        
        ngrok_cmd = [
            "ngrok", 
            "start", 
            "--all", 
            "--config", 
            "./ngrok.yml", 
            "--authtoken", 
            ngrok_token
        ]
        proxy_commands.append(("ngrok", ngrok_cmd))
    else:
        print("⚠️  NGROK_AUTHTOKEN не задан. ngrok запускаться не будет.")
        print("   Установите переменную окружения NGROK_AUTHTOKEN или добавьте NGROK_AUTHTOKEN в Backend/credentials.json.")

    processes = []

    for name, cmd in proxy_commands:
        try:
            visible_cmd = [c if c != ngrok_token else "********" for c in cmd]
            
            # ✅ Настраиваем потоки индивидуально для каждого прокси
            if name == "ngrok":
                # Подавляем TUI-интерфейс ngrok, отправляя вывод в никуда.
                # Токен применится, туннель поднимется в фоне, терминал останется чистым.
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    text=True,
                )
            else:
                # Для serveo оставляем вывод в sys.stdout, чтобы вы видели его ссылку
                proc = subprocess.Popen(
                    cmd,
                    stdout=sys.stdout,
                    stderr=sys.stderr,
                    stdin=subprocess.DEVNULL,
                    text=True,
                )
                
            print(f"✅ Proxy {name} started: {' '.join(visible_cmd)} (pid={proc.pid})")
            processes.append((name, proc))
        except FileNotFoundError:
            print(f"⚠️  Command not found: {cmd[0]}. Proxy {name} skipped.", file=sys.stderr)
        except Exception as exc:
            print(f"❌ Failed to start {name} proxy: {exc}", file=sys.stderr)

    return processes


def stop_proxy_services(processes):
    for name, proc in processes:
        if proc.poll() is None:
            print(f"⏹ Stopping proxy {name} (pid={proc.pid})")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                print(f"⚠️  Proxy {name} killed after timeout.")


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
    parser = argparse.ArgumentParser(description="Запуск FastAPI сервера с опцией прокси")
    parser.add_argument("--proxy", action="store_true", help="Запустить serveo и ngrok вместе с сервером")
    args = parser.parse_args()

    proxy_processes = []
    if args.proxy:
        proxy_processes = launch_proxy_services()

    try:
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=not args.proxy)
    finally:
        stop_proxy_services(proxy_processes)
