import asyncio

import httpx

from penn_planner.config import settings


class PCRClient:
    """Async client for Penn Course Review API.

    The PCR search endpoint returns a plain list (not paginated dict).
    The detail endpoint returns full course info including attributes and sections.
    """

    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or settings.pcr_base_url
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _get(self, path: str, params: dict | None = None) -> dict | list:
        client = await self._get_client()
        url = f"{self.base_url}{path}"
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    async def search_courses(
        self,
        semester: str = "current",
        search: str | None = None,
        attributes: str | None = None,
        difficulty: str | None = None,
        course_quality: str | None = None,
        is_open: bool | None = None,
        page_size: int = 50,
    ) -> list[dict]:
        """Search courses with filters. Returns a list of course summaries."""
        params: dict = {"page_size": page_size}
        if search:
            params["search"] = search
        if attributes:
            params["attributes"] = attributes
        if difficulty:
            params["difficulty"] = difficulty
        if course_quality:
            params["course_quality"] = course_quality
        if is_open is not None:
            params["is_open"] = str(is_open).lower()
        result = await self._get(f"/{semester}/search/courses/", params)
        return result if isinstance(result, list) else result.get("results", [])

    async def get_course(self, full_code: str, semester: str = "current") -> dict:
        """Get detailed course info including attributes and sections."""
        return await self._get(f"/{semester}/courses/{full_code}/")

    async def get_all_courses_for_dept(
        self,
        department: str,
        semester: str = "current",
    ) -> list[dict]:
        """Fetch all courses for a department via search."""
        return await self.search_courses(
            semester=semester,
            search=f"{department}-",
            page_size=500,
        )

    async def get_courses_by_attribute(
        self,
        attribute_expr: str,
        semester: str = "current",
    ) -> list[dict]:
        """Fetch courses matching an attribute expression (e.g. 'EUCR|EUCU')."""
        return await self.search_courses(
            semester=semester,
            attributes=attribute_expr,
            page_size=500,
        )

    async def get_attributes(self) -> list[dict]:
        """Fetch all attribute definitions."""
        return await self._get("/attributes/")
