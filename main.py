import asyncio
import logging

from aiogram import Bot, Dispatcher

from app.handlers import handlersRouter
from config import TOKEN

bot = Bot(token=TOKEN)
dp = Dispatcher()

'''Запуск бота'''
async def main():
    dp.include_router(handlersRouter)
    await dp.start_polling(bot)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except KeyboardInterrupt: # Чтобы красиво выключался
        print('Bot was disabled')