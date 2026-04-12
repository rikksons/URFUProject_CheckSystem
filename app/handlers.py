from aiogram import Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext

from app.states_groups import Registration

import app.keyboards as kb

handlersRouter = Router()

'''Отправка приветственного сообщения'''
@handlersRouter.message(CommandStart())
async def cmd_start(message: Message):
    await message.answer("Добро пожаловать!", reply_markup=kb.to_main_key)

'''Сообщение с выбором опций бота'''
@handlersRouter.message(F.text == 'К выбору опций')
async def main_options(message: Message):
    await message.answer('Выберите опцию', reply_markup=kb.main_keys)

'''Начало диалога регистрации'''
@handlersRouter.callback_query(F.data == 'name_input')
async def registration_start(callback: CallbackQuery, state: FSMContext):
    await state.set_state(Registration.name_check)
    await callback.answer('')
    await callback.message.answer('Напишите ваше ФИО')

'''Момент проверки имени пользователем. Если он увидит ошибки, его снова отправляет
   в registration_start. Иначе он переходит в registration_name'''
@handlersRouter.message(Registration.name_check)
async def registration_name_check(message: Message, state: FSMContext):
    await message.reply('Перепроверьте ФИО. Всё верно?', reply_markup=kb.name_check_key)
    await state.update_data(name=message.text)

'''Этап получения корректного имени пользователя'''
@handlersRouter.callback_query(F.data == 'name_correct')
async def registration_name(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    #TODO сделать вместо простого вывода имени связь с таблицей
    print(data["name"])
    await callback.answer('')
    await callback.message.edit_text("Регистрация завершена")
    await state.clear()
