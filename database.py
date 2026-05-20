# database.py
import gspread
from google.oauth2.service_account import Credentials
from cachetools import TTLCache
from config import SPREADSHEET_ID, SERVICE_ACCOUNT_FILE
from typing import Any, Optional
from datetime import datetime
import time


class SheetsDB:
    def __init__(self):
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=scopes
        )
        self.gc = gspread.authorize(creds)
        self.ss = self.gc.open_by_key(SPREADSHEET_ID)
        self.cache = TTLCache(maxsize=50, ttl=120)

        self.sheet_headers = {
            "Users": ["id", "telegramtag", "name", "role", "created_at"],
            "Projects": [
                "id",
                "owner_id",
                "project_name",
                "description",
                "project_code",
                "status",
                "settings",
                "created_at",
                "updated_at",
            ],
            "Members": ["id", "project_id", "user_id", "role", "status", "created_at"],
            "Works": [
                "id",
                "project_id",
                "iteration_id",
                "author_id",
                "title",
                "content",
                "status",
                "lock_by",
                "submitted_at",
            ],
            "Reviews": [
                "id",
                "work_id",
                "reviewer_id",
                "comment",
                "score",
                "created_at",
            ],
            "Assignments": [
                "id",
                "project_id",
                "work_id",
                "assigned_to",
                "status",
                "assigned_at",
            ],
            "IterationLogs": [
                "id",
                "iteration_id",
                "action",
                "user_id",
                "timestamp",
                "details",
            ],
        }

        self.sheets = {}
        for name, headers in self.sheet_headers.items():
            try:
                self.sheets[name] = self.ss.worksheet(name)
            except gspread.exceptions.WorksheetNotFound:
                ws = self.ss.add_worksheet(name, rows=1000, cols=len(headers))
                ws.update([headers])
                self.sheets[name] = ws

    def _normalize_row(self, row: dict) -> dict:
        normalized = {k.lower().strip(): v for k, v in row.items()}
        for key, value in list(normalized.items()):
            if isinstance(value, str):
                value = value.strip()
                normalized[key] = value

            if key == "id" or key.endswith("_id"):
                if value is not None and str(value).isdigit():
                    try:
                        normalized[key] = int(value)
                    except (ValueError, TypeError):
                        pass
        return normalized

    def _get_all(self, sheet_name: str) -> list[dict]:
        if sheet_name not in self.cache:
            try:
                records = self.sheets[sheet_name].get_all_records()
                self.cache[sheet_name] = [self._normalize_row(r) for r in records]
            except Exception as e:
                # Если таблица повреждена (дублирующиеся заголовки, пустая и т.д.), возвращаем пустой список
                print(f"⚠️ Warning: Could not read sheet '{sheet_name}': {e}")
                self.cache[sheet_name] = []
        return self.cache[sheet_name]

    def invalidate(self, sheet_name: str):
        self.cache.pop(sheet_name, None)

    def find_one(self, sheet_name: str, field: str, value: Any) -> Optional[dict]:
        data = self._get_all(sheet_name)
        str_value = str(value).lower()
        return next(
            (row for row in data if str(row.get(field)).lower() == str_value), None
        )

    def get_next_id(self, sheet_name: str) -> int:
        data = self._get_all(sheet_name)
        ids = [
            int(r["id"])
            for r in data
            if isinstance(r.get("id"), (int, str)) and str(r["id"]).isdigit()
        ]
        return max(ids, default=0) + 1

    def append(self, sheet_name: str, row_data: dict):
        # Используем правильные headers из конфигурации, не из Google Sheets
        headers = self.sheet_headers.get(sheet_name, [])
        if not headers:
            raise ValueError(f"No headers defined for sheet '{sheet_name}'")

        if not row_data.get("id"):
            row_data["id"] = self.get_next_id(sheet_name)

        row = [str(row_data.get(h, "")) for h in headers]
        self.sheets[sheet_name].append_row(row)
        self.invalidate(sheet_name)
        return row_data

    def update(self, sheet_name: str, row_id: int | str, updates: dict):
        data = self._get_all(sheet_name)
        headers = self.sheets[sheet_name].row_values(1)

        row_idx = None
        for i, row in enumerate(data):
            if str(row.get("id")) == str(row_id):
                row_idx = (
                    i + 2
                )  # +2: нумерация строк начинается с 1, +1 строка заголовков
                break

        if not row_idx:
            raise ValueError(f"Row with id={row_id} not found in {sheet_name}")

        if "updated_at" in headers:
            updates["updated_at"] = datetime.utcnow().isoformat() + "Z"

        for col_name, new_val in updates.items():
            if col_name in headers:
                col_idx = headers.index(col_name) + 1
                self.sheets[sheet_name].update_cell(row_idx, col_idx, str(new_val))

        self.invalidate(sheet_name)
        return self.find_one(sheet_name, "id", row_id)

    def delete(self, sheet_name: str, row_id: int | str):
        return self.update(sheet_name, row_id, {"status": "deleted"})

    def hard_delete_row(self, sheet_name: str, row_id: int | str):
        """Находит строку по 'id' и полностью удаляет её."""
        try:
            # 'id' всегда в первой колонке согласно self.sheet_headers
            cell = self.sheets[sheet_name].find(str(row_id), in_column=1)
            if cell:
                self.sheets[sheet_name].delete_rows(cell.row)
                self.invalidate(sheet_name)
                return True
            return False  # Строка не найдена
        except gspread.exceptions.CellNotFound:
            print(f"Info: Row with id={row_id} not found in {sheet_name} for deletion.")
            return False
        except Exception as e:
            print(f"⚠️ Error hard deleting row {row_id} from {sheet_name}: {e}")
            return False


db = SheetsDB()
