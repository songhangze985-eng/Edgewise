from __future__ import annotations

import io
import re

from docx import Document
from fastapi import HTTPException, status
from pypdf import PdfReader

DEFAULT_TEXT_MAX_CHARS = 4000
UPLOAD_TEXT_MAX_CHARS = 500_000

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def decode_text_bytes(file_bytes: bytes, max_chars: int | None = DEFAULT_TEXT_MAX_CHARS) -> str | None:
    limit = max_chars if max_chars is not None else len(file_bytes)
    for encoding in ("utf-8", "gb18030", "gbk"):
        try:
            decoded = file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
        if decoded.strip():
            return decoded[:limit]
    return None


def is_docx(file_name: str, content_type: str) -> bool:
    lowered = file_name.lower()
    return lowered.endswith(".docx") or content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    )


def is_pdf(file_name: str, content_type: str) -> bool:
    lowered = file_name.lower()
    return lowered.endswith(".pdf") or content_type == "application/pdf"


def extract_docx_text(
    file_bytes: bytes,
    max_chars: int | None = DEFAULT_TEXT_MAX_CHARS,
) -> tuple[str | None, list[str]]:
    try:
        document = Document(io.BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无法解析 DOCX 文件: {exc}",
        ) from exc

    paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    emphasized: list[str] = []
    for paragraph in document.paragraphs:
        for run in paragraph.runs:
            if run.bold and run.text.strip():
                token = run.text.strip()
                if len(token) <= 40 and token not in emphasized:
                    emphasized.append(token)
                if len(emphasized) >= 20:
                    break
        if len(emphasized) >= 20:
            break

    text = "\n".join(paragraphs).strip()
    if not text:
        return None, emphasized
    limit = max_chars if max_chars is not None else len(text)
    return text[:limit], emphasized


def extract_pdf_text(file_bytes: bytes, max_chars: int | None = DEFAULT_TEXT_MAX_CHARS) -> str | None:
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无法解析 PDF 文件: {exc}",
        ) from exc

    chunks: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            chunks.append(page_text.strip())
    if not chunks:
        return None
    text = "\n".join(chunks)
    limit = max_chars if max_chars is not None else len(text)
    return text[:limit]


def extract_text_from_upload(
    file_name: str,
    content_type: str,
    file_bytes: bytes,
    *,
    max_chars: int | None = DEFAULT_TEXT_MAX_CHARS,
) -> tuple[str | None, list[str]]:
    """Extract plain text from PDF, DOCX, or plain-text uploads."""
    emphasized_keywords: list[str] = []
    if is_docx(file_name, content_type):
        preview_text, emphasized_keywords = extract_docx_text(file_bytes, max_chars=max_chars)
    elif is_pdf(file_name, content_type):
        preview_text = extract_pdf_text(file_bytes, max_chars=max_chars)
    else:
        preview_text = decode_text_bytes(file_bytes, max_chars=max_chars)

    if preview_text is None and (is_docx(file_name, content_type) or is_pdf(file_name, content_type)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="无法从该文件提取可读文本，请检查是否为扫描件或尝试导出为可搜索 PDF / 纯文本",
        )
    return preview_text, emphasized_keywords
