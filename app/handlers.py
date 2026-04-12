from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message
import app.keyboards as kb

handlersRouter = Router()

'''Отправка приветственного сообщения'''
@handlersRouter.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer("приветствие", reply_markup=kb.registration_key)

@handlersRouter.message(F.text == 'Регистрация/Вход')
async def registration_start(message: Message):
    pass

@handlersRouter.message(F.text == 'MiniApp')
async def miniapp_message(message: Message):
    await message.reply("Запуск мини-апп:", reply_markup=kb.miniapp_inline_key)