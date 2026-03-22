import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from config import settings
from handlers import student, admin

async def main():
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    
    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )
    
    dp = Dispatcher()
    
    dp.include_router(student.router)
    dp.include_router(admin.router)
    
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())