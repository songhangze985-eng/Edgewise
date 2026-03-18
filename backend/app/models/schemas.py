from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class MessageResponse(APIModel):
    message: str


class UserRegister(APIModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class UserLogin(APIModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserPublic(APIModel):
    id: str
    email: str
    name: str
    initials: str
    tier: str
    tier_label: str
    credits: int
    join_date: str
    is_admin: bool = False
    created_at: str
    updated_at: str


class UserInDB(UserPublic):
    password_hash: str


class TokenResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserPublic


class DashboardOverview(APIModel):
    total_sessions: int
    avg_score: float
    streak: int
    credits: int


class ResumeExperienceItem(APIModel):
    company: str
    role: str
    period: str
    desc: str


class ResumeProjectItem(APIModel):
    name: str
    desc: str


class ResumeParsedData(APIModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    education: str | None = None
    experience: list[ResumeExperienceItem] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    projects: list[ResumeProjectItem] = Field(default_factory=list)


class ResumeSuggestion(APIModel):
    id: str
    category: str
    text: str
    impact: int
    applied: bool = False


class ResumeResponse(APIModel):
    id: str
    user_id: str
    file_name: str
    file_size: str
    size: int
    content_type: str
    status: str
    uploaded_at: str
    preview_text: str | None = None
    content_base64: str
    parsed_data: ResumeParsedData | None = None
    suggestions: list[ResumeSuggestion] = Field(default_factory=list)
    optimized_text: str | None = None
    jd_match_score: int | None = None
    jd_keywords: list[str] = Field(default_factory=list)


class LgdParticipant(APIModel):
    user_id: str
    name: str
    role: str


class LgdRoomCreate(APIModel):
    topic: str = Field(min_length=2, max_length=200)
    material: str | None = Field(default=None, max_length=5000)
    max_participants: int = Field(default=8, ge=2, le=8)
    duration_minutes: int = Field(default=20, ge=5, le=180)
    agents: list[str] = Field(default_factory=list)


class LgdRoomResponse(APIModel):
    id: str
    host_user_id: str
    topic: str
    material: str | None = None
    status: str
    phase: str
    participant_count: int
    max_participants: int
    duration_minutes: int
    remaining_seconds: int
    agents: list[str] = Field(default_factory=list)
    participants: list[LgdParticipant] = Field(default_factory=list)
    created_at: str
    updated_at: str


class InterviewSessionCreate(APIModel):
    type: str = Field(default="interview", min_length=3, max_length=50)
    position: str | None = Field(default=None, max_length=200)
    difficulty: str | None = Field(default=None, max_length=50)
    topic: str | None = Field(default=None, max_length=200)
    question_id: str | None = Field(default=None, max_length=50)
    metadata: dict[str, Any] = Field(default_factory=dict)


class InterviewSessionComplete(APIModel):
    score: float = Field(ge=0, le=100)
    duration_minutes: int | None = Field(default=None, ge=1, le=240)
    dimensions: dict[str, float] = Field(default_factory=dict)


class SessionResponse(APIModel):
    id: str
    user_id: str
    type: str
    position: str | None = None
    difficulty: str | None = None
    topic: str | None = None
    question_id: str | None = None
    status: str
    score: float | None = None
    duration_minutes: int | None = None
    date: str
    time: str
    created_at: str
    updated_at: str
    completed_at: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class QuestionStar(APIModel):
    s: str | None = None
    t: str | None = None
    a: str | None = None
    r: str | None = None


class QuestionHistoryItem(APIModel):
    date: str
    score: float
    comment: str


class QuestionRelatedItem(APIModel):
    id: str
    title: str


class QuestionCreate(APIModel):
    id: str | None = Field(default=None, max_length=50)
    title: str = Field(min_length=4, max_length=300)
    category: str = Field(min_length=2, max_length=50)
    difficulty: str = Field(min_length=1, max_length=50)
    ideal: str | None = Field(default=None, max_length=5000)
    star: QuestionStar | None = None
    tags: list[str] = Field(default_factory=list)
    related: list[QuestionRelatedItem] = Field(default_factory=list)


class QuestionResponse(APIModel):
    id: str
    title: str
    category: str
    difficulty: str
    ideal: str | None = None
    star: QuestionStar | None = None
    tags: list[str] = Field(default_factory=list)
    count: int = 0
    collected: bool = False
    history: list[QuestionHistoryItem] = Field(default_factory=list)
    related: list[QuestionRelatedItem] = Field(default_factory=list)
    created_at: str
    updated_at: str
