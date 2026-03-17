from fastapi import Header


async def get_session_id(x_session_id: str = Header(default="")) -> str:
    """Extract session ID from X-Session-ID header."""
    return x_session_id or "default"
