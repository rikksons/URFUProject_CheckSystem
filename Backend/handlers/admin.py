from aiogram import Router, types, F
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from config import settings
from database import SheetsDB
import os

router = Router()
db = SheetsDB()

# ============================================
# 🔐 ПРОВЕРКА АДМИНА
# ============================================
def is_admin(user_id: int) -> bool:
    try:
        admin_id = int(settings.ADMIN_ID) if settings.ADMIN_ID else 0
        return user_id == admin_id
    except (ValueError, TypeError):
        return False

# ============================================
# 🧪 МАШИНА СОСТОЯНИЙ
# ============================================
class GradeState(StatesGroup):
    waiting_for_grade = State()
    waiting_for_comment = State()

class PendingState(StatesGroup):
    viewing_page = State()

# ============================================
# 📋 КОМАНДА: РАБОТЫ НА ПРОВЕРКЕ (С ПАГИНАЦИЕЙ)
# ============================================
WORKS_PER_PAGE = 5  # Сколько работ показывать на одной странице

@router.message(Command("pending"))
async def cmd_pending(message: types.Message, state: FSMContext):
    """Показывает работы с пагинацией"""
    
    if not is_admin(message.from_user.id):
        await message.answer("🔐 Доступ запрещён. Вы не администратор.")
        return
    
    await show_pending_page(message, state, page=0)

async def show_pending_page(message_or_callback, state, page=0, filter_status=None):
    """Показывает страницу работ"""
    
    # Получаем все работы
    pending = db.get_pending_submissions(filter_status)
    
    if not pending:
        text = "🎉 Все работы проверены!"
        if filter_status:
            text += f"\n\n📊 Фильтр: {filter_status}"
        
        if isinstance(message_or_callback, types.CallbackQuery):
            await message_or_callback.message.edit_text(text)
            await message_or_callback.answer()
        else:
            await message_or_callback.answer(text)
        await state.clear()
        return
    
    # Пагинация
    total_pages = (len(pending) - 1) // WORKS_PER_PAGE + 1
    if page < 0:
        page = 0
    if page >= total_pages:
        page = total_pages - 1
    
    start_idx = page * WORKS_PER_PAGE
    end_idx = min(start_idx + WORKS_PER_PAGE, len(pending))
    page_works = pending[start_idx:end_idx]
    
    # Статистика
    total_count = len(pending)
    edited_count = sum(1 for w in pending if w.get('status') == 'Изменена')
    
    # Формируем текст для каждой работы на странице
    works_text = ""
    for i, work in enumerate(page_works, start=start_idx + 1):
        status_emoji = "🔄" if work.get('status') == 'Изменена' else "⏳"
        full_name = work.get('student_name') or '❓ Не указано'
        works_text += (
            f"{i}. {status_emoji} <b>{full_name}</b>\n"
            f"   📅 {work.get('sent_at', '—')}\n"
            f"   🗂 <code>{work.get('record_id', '—')}</code>\n\n"
        )
    
    # Кнопки навигации
    keyboard_buttons = []
    
    # Кнопки для каждой работы на странице
    for i, work in enumerate(page_works, start=start_idx):
        full_name = work.get('student_name', 'Без имени')[:20]
        keyboard_buttons.append([types.InlineKeyboardButton(
            text=f"{i+1}. {full_name}",
            callback_data=f"view_work_{work['record_id']}_{work.get('student_id', '')}"
        )])
    
    # Кнопки навигации по страницам
    nav_buttons = []
    if page > 0:
        nav_buttons.append(types.InlineKeyboardButton(text="⬅️ Назад", callback_data=f"pending_page_{page-1}"))
    if page < total_pages - 1:
        nav_buttons.append(types.InlineKeyboardButton(text="Вперёд ➡️", callback_data=f"pending_page_{page+1}"))
    
    if nav_buttons:
        keyboard_buttons.append(nav_buttons)
    
    # Кнопки фильтров
    keyboard_buttons.append([
        types.InlineKeyboardButton(text="🔄 Изменённые", callback_data="pending_filter_Изменена"),
        types.InlineKeyboardButton(text="📋 Все", callback_data="pending_filter_all")
    ])
    
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=keyboard_buttons)
    
    # Формируем сообщение
    caption = (
        f"📊 <b>Работы на проверке</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📄 Страница {page + 1} из {total_pages}\n"
        f"📦 Показано: {start_idx + 1}-{end_idx} из {total_count}\n"
        f"🔄 Изменено: {edited_count}\n"
        f"━━━━━━━━━━━━━━━━━━\n\n"
        f"{works_text}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"💡 Нажмите на номер работы, чтобы просмотреть и оценить"
    )
    
    if isinstance(message_or_callback, types.CallbackQuery):
        try:
            await message_or_callback.message.edit_text(caption, parse_mode="HTML", reply_markup=keyboard)
        except:
            # Если не удалось редактировать (например, без фото), отправляем новое
            await message_or_callback.message.answer(caption, parse_mode="HTML", reply_markup=keyboard)
        await message_or_callback.answer()
    else:
        await message_or_callback.answer(caption, parse_mode="HTML", reply_markup=keyboard)
    
    # Сохраняем текущую страницу в состоянии
    await state.update_data(current_page=page, filter_status=filter_status)

# ============================================
# 🔄 НАВИГАЦИЯ ПО СТРАНИЦАМ
# ============================================
@router.callback_query(F.data.startswith("pending_page_"))
async def navigate_pages(callback: types.CallbackQuery, state: FSMContext):
    """Переключение страниц"""
    if not is_admin(callback.from_user.id):
        await callback.answer("🔐 Доступ запрещён", show_alert=True)
        return
    
    page = int(callback.data.split("_")[-1])
    data = await state.get_data()
    filter_status = data.get('filter_status')
    
    await show_pending_page(callback, state, page=page, filter_status=filter_status)

# ============================================
# 🎯 ФИЛЬТРЫ
# ============================================
@router.callback_query(F.data.startswith("pending_filter_"))
async def apply_filter(callback: types.CallbackQuery, state: FSMContext):
    """Применение фильтра"""
    if not is_admin(callback.from_user.id):
        await callback.answer("🔐 Доступ запрещён", show_alert=True)
        return
    
    filter_type = callback.data.split("_")[-1]
    filter_status = None if filter_type == "all" else filter_type
    
    await state.update_data(filter_status=filter_status)
    await show_pending_page(callback, state, page=0, filter_status=filter_status)

# ============================================
# 👁️ ПРОСМОТР КОНКРЕТНОЙ РАБОТЫ
# ============================================
@router.callback_query(F.data.startswith("view_work_"))
async def view_work(callback: types.CallbackQuery, state: FSMContext):
    """Просмотр одной работы с фото"""
    if not is_admin(callback.from_user.id):
        await callback.answer("🔐 Доступ запрещён", show_alert=True)
        return
    
    parts = callback.data.split("_")
    if len(parts) < 4:
        await callback.answer("❌ Ошибка формата", show_alert=True)
        return
    
    record_id = parts[2]
    student_id = parts[3]
    
    # Находим работу в БД
    work = db.get_work_by_id(record_id)
    if not work:
        await callback.answer("❌ Работа не найдена", show_alert=True)
        return
    
    status_emoji = "🔄" if work.get('status') == 'Изменена' else "⏳"
    full_name = work.get('student_name') or '❓ Не указано'
    
    caption = (
        f"{status_emoji} <b>{full_name}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"👤 Telegram: {work.get('username', 'Не указан')}\n"
        f"🆔 ID студента: <code>{work.get('student_id', 'Не указан')}</code>\n"
        f"📅 Отправлено: {work.get('sent_at', 'Не указано')}\n"
        f"🗂 Заявка: <code>{work.get('record_id', 'Не указан')}</code>\n"
        f"📊 Статус: {work.get('status', 'На проверке')}\n"
        f"━━━━━━━━━━━━━━━━━━"
    )
    
    keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="✅ Оценить", callback_data=f"grade_{record_id}_{student_id}")],
        [types.InlineKeyboardButton(text="⬅️ Назад к списку", callback_data="pending_back")]
    ])
    
    photo_path = work.get('photo_path', '')
    if photo_path and os.path.exists(photo_path):
        await callback.message.answer_photo(
            photo=types.FSInputFile(photo_path),
            caption=caption,
            parse_mode="HTML",
            reply_markup=keyboard
        )
    else:
        await callback.message.answer(
            f"⚠️ Фото не найдено\n\n{caption}",
            parse_mode="HTML",
            reply_markup=keyboard
        )
    
    await callback.answer()

# ============================================
# ⬅️ НАЗАД К СПИСКУ
# ============================================
@router.callback_query(F.data == "pending_back")
async def back_to_list(callback: types.CallbackQuery, state: FSMContext):
    """Возврат к списку работ"""
    if not is_admin(callback.from_user.id):
        await callback.answer("🔐 Доступ запрещён", show_alert=True)
        return
    
    data = await state.get_data()
    page = data.get('current_page', 0)
    filter_status = data.get('filter_status')
    
    # Удаляем сообщение с фото
    await callback.message.delete()
    
    # Показываем список заново
    await show_pending_page(callback, state, page=page, filter_status=filter_status)

# ============================================
# ⭐ НАЧАЛО ПРОЦЕССА ОЦЕНКИ
# ============================================
@router.callback_query(F.data.startswith("grade_"))
async def start_grading(callback: types.CallbackQuery, state: FSMContext):
    """Запускает процесс оценки работы"""
    
    if not is_admin(callback.from_user.id):
        await callback.answer("🔐 Доступ запрещён", show_alert=True)
        return
    
    parts = callback.data.split("_")
    if len(parts) < 3:
        await callback.answer("❌ Ошибка формата", show_alert=True)
        return
    
    record_id = parts[1]
    student_id = parts[2]
    
    await state.update_data(record_id=record_id, student_id=student_id)
    
    await callback.message.answer(
        "📊 Введите оценку (например: 5, 4, 3, зачёт, незачёт):\n\n"
        "Или отправьте /cancel для отмены"
    )
    await state.set_state(GradeState.waiting_for_grade)
    await callback.answer()

# ============================================
# 📝 ВВОД ОЦЕНКИ
# ============================================
@router.message(GradeState.waiting_for_grade, lambda m: is_admin(m.from_user.id))
async def process_grade(message: types.Message, state: FSMContext):
    """Обрабатывает ввод оценки"""
    
    if message.text == "/cancel":
        await state.clear()
        await message.answer("❌ Оценка отменена")
        return
    
    grade = message.text.strip()
    await state.update_data(grade=grade)
    
    await message.answer(
        "💬 Введите комментарий к работе:\n\n"
        "Или отправьте /skip чтобы пропустить комментарий\n"
        "Или /cancel для отмены"
    )
    await state.set_state(GradeState.waiting_for_comment)

# ============================================
# 💬 ВВОД КОММЕНТАРИЯ
# ============================================
@router.message(GradeState.waiting_for_comment, lambda m: is_admin(m.from_user.id))
async def process_comment(message: types.Message, state: FSMContext):
    """Обрабатывает ввод комментария и завершает оценку"""
    
    if message.text == "/cancel":
        await state.clear()
        await message.answer("❌ Оценка отменена")
        return
    
    comment = message.text.strip() if message.text != "/skip" else "Нет комментария"
    
    data = await state.get_data()
    record_id = data.get('record_id')
    student_id = data.get('student_id')
    grade = data.get('grade')
    
    success = db.update_grade(record_id=record_id, grade=grade, comment=comment)
    
    if success:
        try:
            await message.bot.send_message(
                chat_id=int(student_id),
                text=f"🎓 Ваша работа проверена!\n\n⭐ Оценка: {grade}\n💬 Комментарий: {comment}"
            )
            await message.answer(
                f"✅ Оценка сохранена!\n\n⭐ Оценка: {grade}\n💬 Комментарий: {comment}\n\n📧 Студент уведомлён"
            )
        except:
            await message.answer(
                f"✅ Оценка сохранена!\n\n⭐ Оценка: {grade}\n💬 Комментарий: {comment}\n\n⚠️ Студент не получил уведомление"
            )
    else:
        await message.answer("❌ Ошибка при обновлении таблицы")
    
    await state.clear()

# ============================================
# ❌ ОТМЕНА
# ============================================
@router.message(Command("cancel"))
async def cmd_cancel(message: types.Message, state: FSMContext):
    """Отменяет текущее состояние"""
    current_state = await state.get_state()
    if current_state:
        await state.clear()
        await message.answer("❌ Действие отменено")
    else:
        await message.answer("ℹ️ Нет активного действия для отмены")