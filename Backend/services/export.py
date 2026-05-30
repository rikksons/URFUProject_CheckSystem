# services/export.py
import pandas as pd
from datetime import datetime
from database import db
from fpdf import FPDF
import os
import uuid

def _get_project_data(project_id: int) -> dict:
    """Собирает все данные проекта для экспорта"""
    works = [w for w in db._get_all("Works") if w.get("project_id") == project_id]
    reviews = db._get_all("Reviews")
    users = {u["id"]: u for u in db._get_all("Users")}
    
    rows = []
    for w in works:
        author = users.get(w.get("author_id"), {})
        w_reviews = [r for r in reviews if r.get("work_id") == w["id"]]
        ratings = [int(r.get("score", r.get("rating", 0))) for r in w_reviews]
        
        rows.append({
            "work_id": w.get("id"),
            "title": w.get("title", ""),
            "author_id": w.get("author_id"),
            "author_name": author.get("name", "Unknown"),
            "status": w.get("status", ""),
            "submitted_at": w.get("submitted_at", ""),
            "avg_rating": round(sum(ratings)/len(ratings), 2) if ratings else 0,
            "reviews_count": len(ratings),
            "content": w.get("content", "")
        })
    return {"project_id": project_id, "rows": rows}

def export_to_xlsx(project_id: int) -> str:
    """Экспорт в Excel"""
    data = _get_project_data(project_id)
    df = pd.DataFrame(data["rows"])
    
    # Переименовываем колонки для читаемости
    df = df.rename(columns={
        "work_id": "ID работы",
        "title": "Название",
        "author_name": "Автор",
        "status": "Статус",
        "submitted_at": "Дата сдачи",
        "avg_rating": "Средний балл",
        "reviews_count": "Отзывов",
        "content": "Ссылка/Контент"
    })
    
    filename = f"project_{project_id}_export_{datetime.now().strftime('%Y%m%d')}.xlsx"
    filepath = os.path.join("exports", filename)
    os.makedirs("exports", exist_ok=True)
    
    with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Результаты", index=False)
        # Добавляем сводку
        summary = pd.DataFrame([{
            "Проект": project_id,
            "Всего работ": len(df),
            "Средний балл по проекту": round(df["Средний балл"].mean(), 2) if not df.empty else 0,
            "Дата экспорта": datetime.now().strftime("%Y-%m-%d %H:%M")
        }])
        summary.to_excel(writer, sheet_name="Сводка", index=False)
    
    return filepath

def export_to_pdf(project_id: int) -> str:
    """Экспорт в PDF (простой отчёт)"""
    data = _get_project_data(project_id)
    rows = data["rows"]
    
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, f"Project Report #{project_id}", ln=True, align="C")
    pdf.ln(5)
    
    pdf.set_font("Arial", "", 10)
    pdf.cell(0, 8, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=True)
    pdf.ln(5)
    
    # Таблица
    pdf.set_font("Arial", "B", 9)
    pdf.cell(20, 8, "ID", 1)
    pdf.cell(50, 8, "Title", 1)
    pdf.cell(40, 8, "Author", 1)
    pdf.cell(25, 8, "Rating", 1)
    pdf.cell(25, 8, "Reviews", 1)
    pdf.cell(30, 8, "Status", 1)
    pdf.ln()
    
    pdf.set_font("Arial", "", 8)
    for row in rows:
        # Обрезаем длинные строки
        title = (row["title"][:25] + "..") if len(row["title"]) > 25 else row["title"]
        author = (row["author_name"][:18] + "..") if len(row["author_name"]) > 18 else row["author_name"]
        
        pdf.cell(20, 7, str(row["work_id"]), 1)
        pdf.cell(50, 7, title, 1)
        pdf.cell(40, 7, author, 1)
        pdf.cell(25, 7, str(row["avg_rating"]), 1, align="C")
        pdf.cell(25, 7, str(row["reviews_count"]), 1, align="C")
        pdf.cell(30, 7, row["status"], 1, align="C")
        pdf.ln()
    
    filename = f"project_{project_id}_report_{datetime.now().strftime('%Y%m%d')}.pdf"
    filepath = os.path.join("exports", filename)
    os.makedirs("exports", exist_ok=True)
    pdf.output(filepath)
    
    return filepath

def export_project(project_id: int, format: str = "xlsx") -> tuple[str, str, str]:
    """Универсальный экспорт: возвращает (path, media_type, filename)"""
    if format == "xlsx":
        path = export_to_xlsx(project_id)
        filename = os.path.basename(path)
        return path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename
    else:  # pdf
        path = export_to_pdf(project_id)
        filename = os.path.basename(path)
        return path, "application/pdf", filename