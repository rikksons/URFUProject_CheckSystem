# config.py
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

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