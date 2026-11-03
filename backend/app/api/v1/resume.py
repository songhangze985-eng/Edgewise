from __future__ import annotations

import base64
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from redis.asyncio import Redis

from app.api.deps import get_current_user, get_redis
from app.core.redis_client import get_json, set_json
from app.services.document_parse import EMAIL_PATTERN, extract_text_from_upload
from app.services.resume_questions import regenerate_user_resume_questions
from app.models.schemas import (
    ResumeParsedData,
    ResumeProjectItem,
    ResumeResponse,
    ResumeSuggestion,
    UserInDB,
)

router = APIRouter(prefix="/resume", tags=["resume"])

PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)")
SKILL_KEYWORDS = [
    "Python",
    "SQL",
    "FastAPI",
    "React",
    "Redis",
    "数据分析",
    "产品设计",
    "项目管理",
    "机器学习",
    "沟通协作",
]


def _extract_name(preview_text: str | None, file_name: str, fallback_name: str) -> str:
    if preview_text:
        for line in preview_text.splitlines():
            candidate = line.strip()
            if candidate and len(candidate) <= 20 and "@" not in candidate and "http" not in candidate:
                return candidate
    stem = Path(file_name).stem.strip()
    if stem:
        return stem.split("_")[0][:20]
    return fallback_name


def _extract_education(preview_text: str | None) -> str | None:
    if not preview_text:
        return None
    keywords = ("大学", "学院", "硕士", "本科", "博士", "MBA")
    for line in preview_text.splitlines():
        candidate = line.strip()
        if candidate and any(keyword in candidate for keyword in keywords):
            return candidate[:120]
    return None


def _extract_skills(preview_text: str | None) -> list[str]:
    if not preview_text:
        return []
    normalized = preview_text.lower()
    return [keyword for keyword in SKILL_KEYWORDS if keyword.lower() in normalized]


def _extract_projects(preview_text: str | None) -> list[ResumeProjectItem]:
    if not preview_text:
        return []
    projects: list[ResumeProjectItem] = []
    for line in preview_text.splitlines():
        candidate = line.strip()
        if "项目" in candidate and len(candidate) <= 80:
            projects.append(
                ResumeProjectItem(
                    name=candidate[:30],
                    desc=candidate[:120],
                )
            )
        if len(projects) >= 3:
            break
    return projects


def _build_suggestions(parsed_data: ResumeParsedData, preview_text: str | None) -> list[ResumeSuggestion]:
    suggestions: list[ResumeSuggestion] = []

    if not parsed_data.email:
        suggestions.append(
            ResumeSuggestion(
                id="resume-sug-email",
                category="联系方式",
                text="建议补充邮箱地址，便于招聘方快速联系。",
                impact=9,
            )
        )
    if not parsed_data.phone:
        suggestions.append(
            ResumeSuggestion(
                id="resume-sug-phone",
                category="联系方式",
                text="建议补充手机号，并确保格式统一。",
                impact=8,
            )
        )
    if not parsed_data.education:
        suggestions.append(
            ResumeSuggestion(
                id="resume-sug-edu",
                category="教育背景",
                text="建议明确学校、学历和毕业时间，帮助面试官快速判断背景匹配度。",
                impact=7,
            )
        )
    if not parsed_data.skills:
        suggestions.append(
            ResumeSuggestion(
                id="resume-sug-skills",
                category="技能标签",
                text="建议增加技能关键词，突出与你目标岗位相关的技术或业务能力。",
                impact=8,
            )
        )
    if preview_text and len(preview_text) < 300:
        suggestions.append(
            ResumeSuggestion(
                id="resume-sug-depth",
                category="内容深度",
                text="当前简历文本较短，建议补充项目成果和量化指标，增强说服力。",
                impact=10,
            )
        )

    suggestions.append(
        ResumeSuggestion(
            id="resume-sug-star",
            category="项目表达",
            text="建议关键经历使用 STAR 结构展开：背景、任务、行动和结果。",
            impact=12,
        )
    )
    return suggestions[:5]


def _build_optimized_text(parsed_data: ResumeParsedData, suggestions: list[ResumeSuggestion]) -> str | None:
    sections: list[str] = []
    if parsed_data.name:
        sections.append(parsed_data.name)
    if parsed_data.email or parsed_data.phone:
        sections.append(" | ".join(filter(None, [parsed_data.email, parsed_data.phone])))
    if parsed_data.education:
        sections.append(f"教育背景：{parsed_data.education}")
    if parsed_data.skills:
        sections.append(f"核心技能：{' · '.join(parsed_data.skills)}")
    if parsed_data.projects:
        project_lines = "\n".join(f"- {project.name}: {project.desc}" for project in parsed_data.projects)
        sections.append(f"项目亮点：\n{project_lines}")
    if suggestions:
        suggestion_lines = "\n".join(f"- {item.text}" for item in suggestions[:3])
        sections.append(f"优化建议：\n{suggestion_lines}")
    if not sections:
        return None
    return "\n\n".join(sections)


def _build_resume_record(
    file_name: str,
    content_type: str,
    file_bytes: bytes,
    current_user: UserInDB,
) -> dict:
    preview_text, emphasized_keywords = extract_text_from_upload(
        file_name,
        content_type,
        file_bytes,
    )
    email_match = EMAIL_PATTERN.search(preview_text) if preview_text else None
    phone_match = PHONE_PATTERN.search(preview_text) if preview_text else None
    parsed_data = ResumeParsedData(
        name=_extract_name(preview_text, file_name, current_user.name),
        email=email_match.group(0) if email_match else current_user.email,
        phone=phone_match.group(0) if phone_match else None,
        education=_extract_education(preview_text),
        skills=_extract_skills(preview_text),
        projects=_extract_projects(preview_text),
    )
    suggestions = _build_suggestions(parsed_data, preview_text)
    optimized_text = _build_optimized_text(parsed_data, suggestions)

    upload_time = datetime.now(timezone.utc).isoformat()
    size_in_mb = max(len(file_bytes) / (1024 * 1024), 0.01)

    record_metadata: dict[str, object] = {}
    if emphasized_keywords:
        record_metadata["emphasized_keywords"] = emphasized_keywords

    return {
        "id": uuid4().hex,
        "user_id": current_user.id,
        "file_name": file_name,
        "file_size": f"{size_in_mb:.2f}MB",
        "size": len(file_bytes),
        "content_type": content_type,
        "status": "optimized" if optimized_text else "uploaded",
        "uploaded_at": upload_time,
        "preview_text": preview_text,
        "content_base64": base64.b64encode(file_bytes).decode("ascii"),
        "parsed_data": parsed_data.model_dump(),
        "suggestions": [item.model_dump() for item in suggestions],
        "optimized_text": optimized_text,
        "jd_match_score": None,
        "jd_keywords": [],
        "metadata": record_metadata,
    }


@router.post("/upload", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResumeResponse:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    resume_record = _build_resume_record(
        file_name=file.filename or "resume.bin",
        content_type=file.content_type or "application/octet-stream",
        file_bytes=file_bytes,
        current_user=current_user,
    )
    await set_json(redis, f"resume:{resume_record['id']}", resume_record)
    await redis.sadd(f"user:{current_user.id}:resumes", resume_record["id"])
    await regenerate_user_resume_questions(redis, current_user.id, resume_record["id"])
    return ResumeResponse.model_validate(resume_record)


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: str,
    current_user: UserInDB = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> ResumeResponse:
    resume_record = await get_json(redis, f"resume:{resume_id}")
    if resume_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found",
        )
    if resume_record["user_id"] != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this resume",
        )
    return ResumeResponse.model_validate(resume_record)
