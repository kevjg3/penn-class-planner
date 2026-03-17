from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from penn_planner.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def _run_migrations(conn):
    """Add session_id columns to existing tables if they don't exist."""
    # Check if plan_courses has session_id column
    result = conn.execute(text("PRAGMA table_info(plan_courses)"))
    columns = {row[1] for row in result}
    if "session_id" not in columns:
        conn.execute(text("ALTER TABLE plan_courses ADD COLUMN session_id VARCHAR DEFAULT ''"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_plan_courses_session_id ON plan_courses(session_id)"))

    # Check if user_preferences needs migration (old schema used `key` as PK)
    result = conn.execute(text("PRAGMA table_info(user_preferences)"))
    cols = {row[1] for row in result}
    if "session_id" not in cols:
        # Recreate table with new schema
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_preferences_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id VARCHAR DEFAULT '',
                key VARCHAR,
                value TEXT DEFAULT ''
            )
        """))
        conn.execute(text("""
            INSERT INTO user_preferences_new (session_id, key, value)
            SELECT '', key, value FROM user_preferences
        """))
        conn.execute(text("DROP TABLE user_preferences"))
        conn.execute(text("ALTER TABLE user_preferences_new RENAME TO user_preferences"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_preferences_session_id ON user_preferences(session_id)"))


async def init_db():
    from penn_planner import models  # noqa: F401 – ensure models are registered

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Run migrations for existing tables
        try:
            await conn.run_sync(_run_migrations)
        except Exception:
            pass  # Tables may already be in correct state


async def get_session():
    async with async_session() as session:
        yield session
