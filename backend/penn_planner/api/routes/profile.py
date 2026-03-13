from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from penn_planner.db import get_session
from penn_planner.models import UserPreference

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/program")
async def get_program(session: AsyncSession = Depends(get_session)):
    pref = await session.get(UserPreference, "selected_program")
    return {"program": pref.value if pref else "seas_cs_bse"}


@router.put("/program")
async def set_program(body: dict, session: AsyncSession = Depends(get_session)):
    program = body.get("program", "seas_cs_bse")
    pref = await session.get(UserPreference, "selected_program")
    if pref:
        pref.value = program
    else:
        pref = UserPreference(key="selected_program", value=program)
        session.add(pref)
    await session.commit()
    return {"program": program}
