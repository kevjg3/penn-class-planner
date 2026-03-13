from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from penn_planner.db import Base


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. "CIS-1200"
    title: Mapped[str] = mapped_column(String, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    credits: Mapped[float] = mapped_column(Float, default=1.0)
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    course_quality: Mapped[float | None] = mapped_column(Float, nullable=True)
    instructor_quality: Mapped[float | None] = mapped_column(Float, nullable=True)
    work_required: Mapped[float | None] = mapped_column(Float, nullable=True)
    prerequisites: Mapped[str] = mapped_column(Text, default="")
    semester: Mapped[str] = mapped_column(String, default="")
    attributes_json: Mapped[str] = mapped_column(Text, default="[]")
    sections_json: Mapped[str] = mapped_column(Text, default="[]")
    crosslistings_json: Mapped[str] = mapped_column(Text, default="[]")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    attributes: Mapped[list["CourseAttribute"]] = relationship(back_populates="course", cascade="all, delete-orphan")
    plan_entries: Mapped[list["PlanCourse"]] = relationship(back_populates="course")


class CourseAttribute(Base):
    __tablename__ = "course_attributes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[str] = mapped_column(String, ForeignKey("courses.id"))
    attribute_code: Mapped[str] = mapped_column(String, index=True)
    school: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(String, default="")

    course: Mapped["Course"] = relationship(back_populates="attributes")


class PlanCourse(Base):
    __tablename__ = "plan_courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[str] = mapped_column(String, ForeignKey("courses.id"))
    semester: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="completed")  # completed, in_progress, planned
    grade: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    course: Mapped["Course"] = relationship(back_populates="plan_entries")
    assignments: Mapped[list["RequirementAssignment"]] = relationship(back_populates="plan_course", cascade="all, delete-orphan")


class RequirementAssignment(Base):
    __tablename__ = "requirement_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_course_id: Mapped[int] = mapped_column(Integer, ForeignKey("plan_courses.id"))
    requirement_id: Mapped[str] = mapped_column(String)  # e.g. "core_cis.cis_1200"
    category: Mapped[str] = mapped_column(String, default="")

    plan_course: Mapped["PlanCourse"] = relationship(back_populates="assignments")


class Semester(Base):
    __tablename__ = "semesters"

    code: Mapped[str] = mapped_column(String, primary_key=True)  # e.g. "2025C"
    name: Mapped[str] = mapped_column(String, default="")
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
