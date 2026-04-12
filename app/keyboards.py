from aiogram.types import (ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton)
from config import MINI_APP_URL

registration_key = ReplyKeyboardMarkup(keyboard=[
    [KeyboardButton(text='Регистрация/Вход')],
    [KeyboardButton(text='MiniApp')],
], resize_keyboard=True)

miniapp_inline_key = InlineKeyboardMarkup(inline_keyboard=[
    [InlineKeyboardButton(text="MiniApp", url=MINI_APP_URL)]
])

