from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from penn_planner.db import get_session
from penn_planner.models import UserPreference
from penn_planner.api.deps import get_session_id

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/program")
async def get_program(
    session: AsyncSession = Depends(get_session),
    session_id: str = Depends(get_session_id),
):
    result = await session.execute(
        select(UserPreference).where(
            UserPreference.session_id == session_id,
            UserPreference.key == "selected_program",
        )
    )
    pref = result.scalar_one_or_none()
    return {"program": pref.value if pref else "seas_cs_bse"}


@router.put("/program")
async def set_program(
    body: dict,
    session: AsyncSession = Depends(get_session),
    session_id: str = Depends(get_session_id),
):
    program = body.get("program", "seas_cs_bse")
    result = await session.execute(
        select(UserPreference).where(
            UserPreference.session_id == session_id,
            UserPreference.key == "selected_program",
        )
    )
    pref = result.scalar_one_or_none()
    if pref:
        pref.value = program
    else:
        pref = UserPreference(session_id=session_id, key="selected_program", value=program)
        session.add(pref)
    await session.commit()
    return {"program": program}
