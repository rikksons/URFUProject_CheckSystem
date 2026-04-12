from aiogram.types import (ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton)
from config import MINI_APP_URL

to_main_key = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text='К выбору опций')]
], resize_keyboard=True)

main_keys = InlineKeyboardMarkup(inline_keyboard=[
    # две кнопки в одной строке
    [InlineKeyboardButton(text='Регистрация/Вход', callback_data='name_input'),
     InlineKeyboardButton(text="MiniApp", url=MINI_APP_URL)],
], resize_keyboard=True)

# две кнопки при проверки вводимого пользователем имени
name_check_key = InlineKeyboardMarkup(inline_keyboard=[
    [InlineKeyboardButton(text='Да, верно', callback_data='name_correct')],
    [InlineKeyboardButton(text='Нет, изменить', callback_data='name_input')]
])

