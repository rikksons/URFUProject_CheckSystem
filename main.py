import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import Message

from config import TOKEN

bot = Bot(token=TOKEN)
dp = Dispatcher()

'''Отправка приветственного сообщения'''
@dp.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer("приветствие")

'''Запуск бота'''
async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())