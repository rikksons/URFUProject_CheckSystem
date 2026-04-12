from aiogram.fsm.state import StatesGroup, State

class Registration(StatesGroup):
    name_check = State()