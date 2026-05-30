from aiogram import Router, F, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from config import settings
from database import SheetsDB
import os
import aiofiles
import logging

router = Router()
db = SheetsDB()

# Машина состояний для студента
class StudentState(StatesGroup):
    waiting_for_name = State()      # Ждём ФИО
    waiting_for_replace_confirm = State()  # Ждём подтверждения замены

@router.message(Command("start"))
async def cmd_start(message: types.Message):
    await message.answer(
        "👋 Привет! Я бот для отправки работ.\n\n"
        "📸 Отправь фото работы, затем укажи ФИО как в паспорте.\n"
        "✏️ Если нужно исправить работу — просто отправь новое фото, пока она на проверке.\n"
        "📝 После проверки ты получишь оценку и комментарий."
    )

@router.message(F.photo)
async def handle_photo(message: types.Message, state: FSMContext):
    # Проверяем, есть ли у студента работа на проверке
    existing = db.get_student_pending(message.from_user.id)
    
    if existing:
        # Предлагаем заменить
        keyboard = types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton(
                text="✅ Да, заменить работу", 
                callback_data=f"replace_{existing['record_id']}"
            )],
            [types.InlineKeyboardButton(
                text="❌ Нет, отмена", 
                callback_data="cancel_replace"
            )]
        ])
        
        status_text = "🔄 Изменена" if existing['status'] == "Изменена" else "⏳ На проверке"
        await message.answer(
            f"⚠️ У вас уже есть работа {status_text}!\n\n"
            f"👤 ФИО: {existing['student_name'] or 'Не указано'}\n"
            f"🆔 Заявка: `{existing['record_id']}`\n\n"
            f"Хотите заменить её новым фото?",
            parse_mode="Markdown",
            reply_markup=keyboard
        )
        # Сохраняем новое фото во временное хранилище состояния
        await state.update_data(
            temp_photo=message.photo[-1],
            temp_user_id=message.from_user.id,
            temp_username=message.from_user.username
        )
        await state.set_state(StudentState.waiting_for_replace_confirm)
        return
    
    # === Новая работа: скачиваем фото ===
    photo = message.photo[-1]
    file = await message.bot.get_file(photo.file_id)
    file_path = f"{settings.PHOTOS_DIR}/{message.from_user.id}_{file.file_unique_id}.jpg"
    
    os.makedirs(settings.PHOTOS_DIR, exist_ok=True)
    
    try:
        file_stream = await message.bot.download_file(file.file_path)
        file_bytes = file_stream.read()
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_bytes)
    except Exception as e:
        logging.error(f"Ошибка сохранения фото: {e}")
        await message.answer("❌ Ошибка при сохранении фото. Попробуйте ещё раз.")
        return
    
    # Сохраняем путь к фото в состоянии
    await state.update_data(
        photo_path=file_path,
        user_id=message.from_user.id,
        username=message.from_user.username
    )
    
    # === Запрашиваем ФИО ===
    await message.answer(
        "📝 Пожалуйста, напишите ваше ФИО как в паспорте:\n\n"
        "Пример: <code>Иванов Иван Иванович</code>\n\n"
        "Или отправьте /cancel для отмены",
        parse_mode="HTML"
    )
    await state.set_state(StudentState.waiting_for_name)

@router.message(StudentState.waiting_for_name)
async def process_name(message: types.Message, state: FSMContext):
    if message.text == "/cancel":
        await state.clear()
        await message.answer("❌ Отправка работы отменена")
        return
    
    data = await state.get_data()
    photo_path = data.get('photo_path')
    user_id = data.get('user_id')
    username = data.get('username')
    
    if not photo_path:
        await message.answer("❌ Ошибка: фото не найдено. Отправьте работу заново.")
        await state.clear()
        return
    
    full_name = message.text.strip()
    
    # Записываем в Google Sheets
    record_id = db.add_submission(
        user_id=user_id,
        username=username,
        photo_path=photo_path,
        student_name=full_name
    )
    
    await message.answer(
        f"✅ Работа отправлена на проверку!\n\n"
        f"👤 ФИО: {full_name}\n"
        f"🆔 ID заявки: `{record_id}`\n\n"
        f"📊 Статус можно посмотреть в таблице преподавателя",
        parse_mode="Markdown"
    )
    await state.clear()

@router.callback_query(F.data.startswith("replace_"))
async def confirm_replace(callback: types.CallbackQuery, state: FSMContext):
    """Подтверждение замены работы"""
    record_id = callback.data.split("_")[1]
    
    # Скачиваем сохранённое новое фото
    state_data = await state.get_data()
    temp_photo = state_data.get('temp_photo')
    
    if not temp_photo:
        await callback.answer("❌ Ошибка: фото не найдено", show_alert=True)
        return
    
    file = await callback.bot.get_file(temp_photo.file_id)
    new_photo_path = f"{settings.PHOTOS_DIR}/{state_data['temp_user_id']}_{file.file_unique_id}_edit.jpg"
    
    os.makedirs(settings.PHOTOS_DIR, exist_ok=True)
    
    try:
        file_stream = await callback.bot.download_file(file.file_path)
        file_bytes = file_stream.read()
        async with aiofiles.open(new_photo_path, 'wb') as f:
            await f.write(file_bytes)
    except Exception as e:
        logging.error(f"Ошибка сохранения фото: {e}")
        await callback.answer("❌ Ошибка при сохранении", show_alert=True)
        return
    
    # Обновляем в БД
    success = db.update_submission(
        record_id=record_id,
        new_photo_path=new_photo_path,
        student_name=""  # Имя не меняем
    )
    
    if success:
        await callback.message.edit_text(
            f"✅ Работа обновлена!\n\n"
            f"🆔 Заявка: `{record_id}`\n"
            f"📊 Статус в таблице: <b>Изменена</b>",
            parse_mode="HTML"
        )
        await callback.answer("✅ Работа заменена")
    else:
        await callback.answer("❌ Ошибка при обновлении", show_alert=True)
    
    await state.clear()

@router.callback_query(F.data == "cancel_replace")
async def cancel_replace(callback: types.CallbackQuery, state: FSMContext):
    """Отмена замены работы"""
    await callback.message.edit_text("❌ Замена работы отменена")
    await callback.answer()
    await state.clear()

@router.message(Command("cancel"), StudentState.waiting_for_name)
async def cmd_cancel(message: types.Message, state: FSMContext):
    """Отмена ввода ФИО"""
    await message.answer("❌ Отправка работы отменена")
    await state.clear()

@router.message(Command("mywork"))
async def cmd_mywork(message: types.Message):
    """Показать статус текущей работы студента"""
    pending = db.get_student_pending(message.from_user.id)
    
    if not pending:
        await message.answer("📭 У вас нет работ на проверке.\nОтправьте фото, чтобы начать.")
        return
    
    status_emoji = "🔄" if pending['status'] == "Изменена" else "⏳"
    await message.answer(
        f"{status_emoji} Ваша работа:\n\n"
        f"👤 ФИО: {pending['student_name'] or 'Не указано'}\n"
        f"📊 Статус: {pending['status']}\n"
        f"🆔 Заявка: `{pending['record_id']}`\n\n"
        f"✏️ Чтобы заменить работу — просто отправьте новое фото",
        parse_mode="Markdown"
    )