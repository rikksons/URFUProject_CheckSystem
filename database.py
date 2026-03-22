import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime
from config import settings
import os

class SheetsDB:
    def __init__(self):
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        creds = Credentials.from_service_account_file(
            settings.CREDENTIALS_PATH, scopes=scopes
        )
        self.client = gspread.authorize(creds)
        self.sheet = self.client.open_by_key(settings.SPREADSHEET_ID).get_worksheet(settings.SHEET_ID)
        self._init_sheet()
    
    def _init_sheet(self):
        """Создаёт заголовки, если таблица пустая"""
        if self.sheet.row_values(1) == []:
            headers = ["ID", "Student ID", "Student Name", "Username", "Photo Path", 
                      "Sent At", "Grade", "Comment", "Status"]
            self.sheet.append_row(headers)
    
    def add_submission(self, user_id: int, username: str, photo_path: str, student_name: str = ""):
        """Добавляет новую работу студента"""
        row = [
            datetime.now().strftime("%Y%m%d%H%M%S"),  
            user_id,                                  
            student_name,                             
            f"@{username}" if username else "",       
            photo_path,                               
            datetime.now().strftime("%Y-%m-%d %H:%M"),
            "",                                       
            "",                                       
            "На проверке"                             
        ]
        self.sheet.append_row(row)
        return row[0]
    
    def update_submission(self, record_id: str, new_photo_path: str, student_name: str = ""):
        """Обновляет работу при редактировании"""
        records = self.sheet.get_all_values()
        
        for i, row in enumerate(records, start=1):
            if row[0] == record_id:
                updates = []
                if student_name:
                    updates.append((f'C{i}', [[student_name]]))
                updates.append((f'E{i}', [[new_photo_path]]))
                updates.append((f'F{i}', [[datetime.now().strftime("%Y-%m-%d %H:%M") + " (ред.)"]]))
                updates.append((f'I{i}', [["Изменена"]]))
                
                for range_name, values in updates:
                    self.sheet.update(range_name, values)
                return True
        return False
    
    def update_grade(self, record_id: str, grade: str, comment: str = ""):
        """Обновляет оценку и комментарий"""
        records = self.sheet.get_all_values()
        
        for i, row in enumerate(records, start=1):
            if row[0] == record_id:
                self.sheet.update(
                    f'G{i}:I{i}',
                    [[grade, comment if comment else "Нет комментария", "Проверено"]]
                )
                return True
        return False
    
    def get_pending_submissions(self, filter_status=None):
        """Возвращает работы на проверке с опциональным фильтром"""
        records = self.sheet.get_all_values()
        pending = []
        
        for row in records[1:]:
            if len(row) >= 9:
                status = row[8]
                if filter_status is None:
                    if status in ["На проверке", "Изменена"]:
                        pending.append({
                            'record_id': row[0],
                            'student_id': row[1],
                            'student_name': row[2],
                            'username': row[3],
                            'photo_path': row[4],
                            'sent_at': row[5],
                            'status': status
                        })
                else:
                    if status == filter_status:
                        pending.append({
                            'record_id': row[0],
                            'student_id': row[1],
                            'student_name': row[2],
                            'username': row[3],
                            'photo_path': row[4],
                            'sent_at': row[5],
                            'status': status
                        })
        return pending
    
    def get_work_by_id(self, record_id: str):
        """Находит работу по ID"""
        records = self.sheet.get_all_values()
        
        for row in records[1:]:
            if len(row) >= 9 and row[0] == record_id:
                return {
                    'record_id': row[0],
                    'student_id': row[1],
                    'student_name': row[2],
                    'username': row[3],
                    'photo_path': row[4],
                    'sent_at': row[5],
                    'grade': row[6],
                    'comment': row[7],
                    'status': row[8]
                }
        return None
    
    def get_student_pending(self, student_id: int):
        """Находит незавершённую работу студента"""
        records = self.sheet.get_all_values()
        for row in records[1:]:
            if len(row) >= 9 and str(row[1]) == str(student_id):
                status = row[8] if len(row) > 8 else ""
                if status in ["На проверке", "Изменена"]:
                    return {
                        'record_id': row[0],
                        'photo_path': row[4],
                        'student_name': row[2],
                        'status': status
                    }
        return None