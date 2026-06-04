import argparse
import json
import os
import re

import subprocess
import sys
import threading
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


FRONTEND_SERVEO_JS = Path(__file__).resolve().parent.parent / "frontend" / "js" / "serveo-url.js"


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
            token = data.get("NGROK_AUTHTOKEN")
            # ✅ Валидация: токен должен содержать только безопасные символы
            if token and not re.match(r"^[a-zA-Z0-9_\-]{10,}$", str(token)):
                print(f"⚠️ Некорректный формат NGROK_AUTHTOKEN. Пропускаем.", file=sys.stderr)
                return None
            return token
    except Exception as exc:
        print(f"⚠️ Ошибка чтения {credentials_path}: {exc}", file=sys.stderr)
        return None


def write_serveo_url_script(url=None):
    try:
        FRONTEND_SERVEO_JS.parent.mkdir(parents=True, exist_ok=True)
        with FRONTEND_SERVEO_JS.open("w", encoding="utf-8") as handle:
            if url:
                js_url = json.dumps(url)
                handle.write(f"window.SERVEO_API_URL = {js_url};\n")
                handle.write(f"console.log('✅ Serveo API URL set: {url}');\n")
            else:
                handle.write("window.SERVEO_API_URL = null;\n")
                handle.write("console.log('ℹ️ Serveo API URL is not configured, fallback to localhost.');\n")
    except Exception as exc:
        print(f"⚠️ Ошибка записи {FRONTEND_SERVEO_JS}: {exc}", file=sys.stderr)


def watch_serveo_output(proc):
    if proc.stdout is None:
        return
    for raw_line in proc.stdout:
        line = raw_line.strip()
        if line:
            print(line)
        match = re.search(r"https?://[\w\-\.]+(?:\.serveo(?:\.net|usercontent\.com)|[\w\-\.]+)", line)
        if match:
            write_serveo_url_script(match.group(0))


# write default file so frontend always has the script
write_serveo_url_script(None)


def launch_proxy_services():
    """Запускает proxy: serveo и ngrok."""
    proxy_commands = [
        ("serveo", ["ssh", "-o", "ServerAliveInterval=60", "-o", "ServerAliveCountMax=3", "-R", "woodzeii:80:localhost:8000", "serveo.net", "|", "grep", "-v", "-E", "Tip|Upgrade to Pro"]),
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
            # ✅ БЕЗОПАСНО: используем list-форму вместо shell=True
            # ✅ Команды жёстко закодированы, без eval/exec/format
            if name == "ngrok":
                # Подавляем TUI-интерфейс ngrok, отправляя вывод в никуда.
                proc = subprocess.Popen(
                    cmd,  # ← list, не строка - защита от command injection
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    text=True,
                    # Не используем shell=True - КРИТИЧНО для безопасности!
                )
            else:
                # Для serveo читаем вывод, чтобы автоматически определить URL.
                proc = subprocess.Popen(
                    cmd,  # ← list, не строка - защита от command injection
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    text=True,
                    # Не используем shell=True - КРИТИЧНО для безопасности!
                )
                threading.Thread(target=watch_serveo_output, args=(proc,), daemon=True).start()

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
