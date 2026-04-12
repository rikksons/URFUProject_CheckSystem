from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

handlersRouter = Router()

'''Отправка приветственного сообщения'''
@handlersRouter.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer("приветствие")