<<<<<<< HEAD
=======
# config.py
from pathlib import Path
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
import os
from dotenv import load_dotenv

load_dotenv()

<<<<<<< HEAD
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", "service_account.json")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

SHEET_NAMES = ["Users", "Projects", "Members", "Iterations", "Works", "Reviews", "Assignments", "IterationLogs"]
=======
BASE_DIR = Path(__file__).resolve().parent

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE", str(BASE_DIR / "service_account.json"))

# JWT настройки
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me-in-prod")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

# Режим авторизации: "jwt" или "x-user-id" (для отладки)
AUTH_MODE = os.getenv("AUTH_MODE", "jwt")

SHEET_NAMES = ["Users", "Projects", "Members", "Iterations", "Works", "Reviews", "Assignments", "IterationLogs"]

if not Path(SERVICE_ACCOUNT_FILE).exists():
    raise RuntimeError(f"🔑 Файл '{SERVICE_ACCOUNT_FILE}' не найден")
>>>>>>> 5070319 (fix: исправлена авторизация, обновлены api.js и app.js, добавлен)
