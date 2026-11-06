#!/usr/bin/env python3
"""Extract interview questions from handbook PDFs and emit pdf_import_seed.py."""

from __future__ import annotations

import argparse
import json
import os
import pprint
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore[assignment]

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent
OUT_PATH = ROOT / "app" / "data" / "pdf_import_seed.py"

PDF_FILENAMES = {
    "alg": "大厂算法与手撕代码高频题库.pdf",
    "bagu": "综合八股文与大厂面经题库.pdf",
    "ai": "AI大模型与前沿方向面试题库.pdf",
}


def resolve_pdf_paths(input_dir: str | None = None) -> dict[str, Path]:
    candidate_dirs = []
    if input_dir:
        candidate_dirs.append(Path(input_dir).expanduser().resolve())
    if os.environ.get("EDGEWISE_PDF_DIR"):
        candidate_dirs.append(Path(os.environ["EDGEWISE_PDF_DIR"]).expanduser().resolve())
    candidate_dirs.extend([
        REPO_ROOT / "面试数据集" / "pdfs",
        REPO_ROOT / "面试数据集",
        REPO_ROOT.parent,
    ])
    resolved: dict[str, Path] = {}
    for key, fname in PDF_FILENAMES.items():
        found = None
        for d in candidate_dirs:
            cand = d / fname
            if cand.is_file():
                found = cand
                break
        resolved[key] = found or (candidate_dirs[0] / fname)
    return resolved


PDF_PATHS = resolve_pdf_paths()

PAGE_FOOTER = re.compile(
    r"^大厂(?:算法与手撕代码高频题库|综合八股文与真实面经题库|AI 大模型与前沿方向高频面试题库)"
    r"（[^）\n]+） Page \d+ of \d+\s*$",
    re.M,
)
HEADER_LINE = re.compile(r"^INTERVIEW PREPARATION HANDBOOK.*$", re.M)
RANK_LC = re.compile(
    r"^(\d{1,2})\s+LC\s+(\d+(?:\s*/\s*\d+)?)\.\s*(.+)$",
    re.M,
)
SECTION_ALG = re.compile(r"^[一二三四五六七八九十]+、\s*(.+)$", re.M)
MODULE_BAGU = re.compile(r"^模块[一二三四五六七八九十\d]+：\s*(.+)$", re.M)
Q_START = re.compile(r"^Q(\d+)\.\s*(.+)$", re.M)
DIFFICULTY = {"简单", "中等", "困难"}


def read_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    text = HEADER_LINE.sub("", text)
    text = PAGE_FOOTER.sub("\n", text)
    return text.replace("\r\n", "\n")


def clean_ws(s: str, keep_paragraphs: bool = False) -> str:
    if keep_paragraphs:
        s = re.sub(r"[ \t]+", " ", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()
    return re.sub(r"\s+", " ", s).strip()


def truncate(s: str, n: int) -> str:
    s = clean_ws(s)
    if len(s) <= n:
        return s
    return s[: n - 1] + "…"


def existing_seed_ids() -> set[str]:
    ids: set[str] = set()
    for rel in ("app/services/seed_service.py", "app/data/coding_seed.py", "app/data/structured_seed.py"):
        text = (ROOT / rel).read_text(encoding="utf-8")
        ids.update(re.findall(r'"id":\s*"([^"]+)"', text))
    return ids


def parse_alg_top30(text: str) -> list[dict]:
    start = text.find("Top 30 核心题表")
    if start < 0:
        start = text.find("排名 力扣题号与题目名称")
    end = text.find("二、 CodeTop Top 3 必考母题")
    if end < 0:
        end = text.find("CodeTop Top 3 必考母题")
    if start < 0 or end < 0:
        return []
    block = text[start:end]
    matches = list(RANK_LC.finditer(block))
    items: list[dict] = []
    for i, m in enumerate(matches):
        rank = int(m.group(1))
        lc_num = m.group(2).replace(" ", "")
        title_start = m.group(3).strip()
        chunk_end = matches[i + 1].start() if i + 1 < len(matches) else len(block)
        body = block[m.end() : chunk_end]
        chunk = clean_ws(f"{title_start} {body}")
        diff = "中等"
        diff_m = re.search(r"(简单|中等|困难)", chunk)
        if diff_m:
            diff = diff_m.group(1)
            title_part = chunk[: diff_m.start()].strip()
            reference = chunk[diff_m.start() :].strip()
        else:
            title_part = chunk
            reference = ""
        title_part = clean_ws(re.sub(r"^LC\s+\d+[^.]+\.\s*", "", title_part))
        full_title = f"LC {lc_num} {title_part}"
        items.append(
            {
                "id": f"ALG-{rank:03d}",
                "lang": "zh-CN",
                "title": truncate(full_title, 280),
                "category": "编程题",
                "difficulty": diff,
                "type": "coding",
                "coding_language": "javascript",
                "entry_point": "solution",
                "problem_statement": truncate(full_title, 2000),
                "signature": "function solution(/* args */) {\n  // 实现核心逻辑\n}",
                "starter_code": "function solution(/* args */) {\n  \n}\n",
                "samples": [],
                "hidden_tests": [],
                "assessment_points": "考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。",
                "answer_structure": "口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。",
                "tags": ["CodeTop", "手撕代码", f"LC{lc_num.split('/')[0]}"],
                "ideal": truncate(reference, 4800) or None,
            }
        )
    return items


def parse_alg_templates(text: str) -> list[dict]:
    start = text.find("二、 CodeTop Top 3 必考母题")
    end = text.find("三、力扣（ LeetCode ）面试经典")
    if start < 0 or end < 0:
        return []
    block = text[start:end]
    parts = re.split(r"\n(?=\d+\.\s)", block)
    items: list[dict] = []
    for part in parts[1:]:
        m = re.match(r"^(\d+)\.\s*(.+?)(?:\n|$)", part)
        if not m:
            continue
        idx = int(m.group(1))
        heading = m.group(2).strip()
        code_m = re.search(r"(def |class LRUCache|# 【 Python)", part)
        code = part[code_m.start() :] if code_m else ""
        code = re.split(r"\n大厂算法", code)[0].strip()
        items.append(
            {
                "id": f"ALG-T{idx:02d}",
                "lang": "zh-CN",
                "title": truncate(f"手撕模板：{heading}", 280),
                "category": "编程题",
                "difficulty": "中等",
                "type": "coding",
                "coding_language": "python",
                "entry_point": "solution",
                "problem_statement": heading,
                "signature": code[:800] if code else "def solution():\n    pass",
                "starter_code": code[:2000] if code else "def solution():\n    pass\n",
                "samples": [],
                "hidden_tests": [],
                "tags": ["CodeTop", "手撕模板", "Python"],
                "assessment_points": "考察标准模板能否手写并通过复杂度追问。",
            }
        )
    return items


def parse_alg_leetcode150_topics(text: str) -> list[dict]:
    start = text.find("三、力扣（ LeetCode ）面试经典")
    end = text.find("四、卡码网（ KamaCoder ）")
    if start < 0 or end < 0:
        return []
    block = text[start:end]
    compact = re.sub(r"\s+", " ", block)
    rows = re.findall(
        r"(\d{1,2})\.\s+(.+?)\s+(\d+)\s*题\s+(.+?)\s+((?:原地|相向|模拟|区间|凡涉及|区分|网格|回溯|红蓝|背包)[^\.]+(?:\.[^0-9]|$))",
        compact,
    )
    if len(rows) < 8:
        rows = []
        for m in re.finditer(r"(\d{1,2})\.\s+(.+?)\s+(\d+)\s*题", compact):
            tail = compact[m.end() : m.end() + 420]
            rows.append((m.group(1), m.group(2).strip(), m.group(3), tail[:200], tail[200:]))
    items: list[dict] = []
    for num, topic, count, reps, method in rows:
        title = f"力扣经典150 · {topic.strip()}（{count}题）"
        items.append(
            {
                "id": f"ALG-L150-{int(num):02d}",
                "lang": "zh-CN",
                "title": truncate(title, 280),
                "category": "专业知识",
                "difficulty": "中等",
                "type": "professional",
                "ideal": truncate(f"代表题目：{reps}\n\n通法：{method}", 4800),
                "tags": ["LeetCode150", topic.strip()],
                "assessment_points": "考察该专题核心题型与通法模型是否掌握。",
            }
        )
    return items


def parse_alg_acm(text: str) -> list[dict]:
    start = text.find("四、卡码网（ KamaCoder ）")
    if start < 0:
        return []
    block = text[start:]
    items: list[dict] = [
        {
            "id": "ALG-ACM-01",
            "lang": "zh-CN",
            "title": "ACM 模式：大厂笔试输入输出与 C++/Python 模板要点",
            "category": "编程题",
            "difficulty": "中等",
            "type": "professional",
            "ideal": truncate(block, 4800),
            "tags": ["KamaCoder", "ACM", "笔试"],
            "assessment_points": "考察 ACM 模式下 IO 处理、边界与工程规范。",
        }
    ]
    return items


def parse_q_sections(text: str, prefix: str, default_category: str, extra_tags: list[str]) -> list[dict]:
    items: list[dict] = []
    module = default_category
    for m in MODULE_BAGU.finditer(text):
        module = m.group(1).strip()

    matches = list(Q_START.finditer(text))
    for i, m in enumerate(matches):
        qnum = int(m.group(1))
        title_line = m.group(2).strip()
        chunk_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end() : chunk_end]
        # stop at next module header inside body
        mod_in = MODULE_BAGU.search(body)
        if mod_in:
            body = body[: mod_in.start()]
        title = clean_ws(title_line)
        ideal = truncate(body, 4800)
        cat = infer_category(module, title)
        qtype = "coding" if _is_coding_question(title, body) else "professional"
        payload: dict = {
            "id": f"{prefix}-{qnum:03d}",
            "lang": "zh-CN",
            "title": truncate(title, 280),
            "category": cat,
            "difficulty": infer_difficulty(title, body),
            "type": qtype,
            "ideal": ideal,
            "tags": extra_tags + [module[:20]],
            "assessment_points": f"考察{cat}相关原理、工程实践与表达结构（PDF 原题）。",
        }
        if qtype == "coding":
            payload.update(_coding_from_body(title, body))
        items.append(payload)
    return items


def infer_category(module: str, title: str) -> str:
    m = module.lower()
    t = title.lower()
    if "mysql" in m or "innodb" in t or "事务" in title or "索引" in title:
        return "专业知识"
    if "redis" in m or "redis" in t or "缓存" in title:
        return "专业知识"
    if "spring" in m or "kafka" in t or "tcp" in t or "https" in t:
        return "专业知识"
    if "java" in m or "jvm" in m or "线程" in title or "hashmap" in t:
        return "专业知识"
    if "agent" in t or "rag" in t or "llm" in t or "transformer" in t or "mcp" in t:
        return "专业知识"
    if "设计" in title or "秒杀" in title:
        return "案例分析"
    if "手撕" in title or "pytorch" in t:
        return "编程题"
    return "专业知识"


def infer_difficulty(title: str, body: str) -> str:
    if "开放" in title or "设计" in title or "手撕" in title:
        return "困难"
    if len(body) > 1200:
        return "困难"
    if len(body) < 400:
        return "简单"
    return "中等"


def _is_coding_question(title: str, body: str) -> bool:
    if "手撕" in title and ("pytorch" in body.lower() or "def " in body or "class " in body):
        return True
    if re.search(r"^import torch", body, re.M):
        return True
    return False


def _coding_from_body(title: str, body: str) -> dict:
    code_m = re.search(r"(import math[\s\S]+?return self\.out_proj\(out\))", body)
    code = code_m.group(1) if code_m else "def solution():\n    pass\n"
    return {
        "coding_language": "python",
        "entry_point": "CausalMultiHeadAttention",
        "problem_statement": title,
        "signature": code[:1200],
        "starter_code": code[:2500],
        "samples": [],
        "hidden_tests": [],
        "answer_structure": "口述 MHA 原理 → 手写模块 → 说明 Causal Mask 与复杂度。",
    }


def parse_bagu_tables(text: str) -> list[dict]:
    items: list[dict] = []
    # Module 2 JVM table topics (first column before deep follow-up column)
    jvm_topics = [
        ("BAGU-JVM-01", "运行时数据区与元空间（JVM）", "模块二： JVM 内存模型"),
        ("BAGU-JVM-02", "垃圾回收算法与回收器演进（CMS/G1/ZGC）", "模块二： JVM"),
        ("BAGU-JVM-03", "双亲委派机制与打破场景", "模块二： JVM"),
        ("BAGU-JVM-04", "线上 CPU 100% 与 OOM 排查全流程", "模块二： JVM"),
    ]
    for qid, title, mod in jvm_topics:
        items.append(
            {
                "id": qid,
                "lang": "zh-CN",
                "title": title,
                "category": "专业知识",
                "difficulty": "困难",
                "type": "professional",
                "ideal": _extract_table_row(text, title.split("（")[0][:8]),
                "tags": ["八股文", "JVM", mod],
                "assessment_points": "考察 JVM 原理与线上故障排查思路。",
            }
        )
    redis_topics = [
        ("BAGU-REDIS-01", "Redis ZSet 为什么用跳表而不是红黑树？", "模块四： Redis"),
        ("BAGU-REDIS-02", "Redis 持久化：RDB、AOF 与混合持久化如何权衡？", "模块四： Redis"),
        ("BAGU-REDIS-03", "缓存穿透、缓存击穿、缓存雪崩的区别与治理方案", "模块四： Redis"),
        ("BAGU-REDIS-04", "Redis 与 MySQL 如何保证双写一致性？", "模块四： Redis"),
    ]
    for qid, title, mod in redis_topics:
        items.append(
            {
                "id": qid,
                "lang": "zh-CN",
                "title": title,
                "category": "专业知识",
                "difficulty": "困难",
                "type": "professional",
                "ideal": _extract_table_row(text, title[:12]),
                "tags": ["八股文", "Redis", mod],
                "assessment_points": "考察 Redis 高并发架构与一致性工程方案。",
            }
        )
    # Module 6 system design
    m6 = text.find("模块六：高并发系统设计")
    if m6 >= 0:
        body = text[m6:]
        items.append(
            {
                "id": "BAGU-SYS-01",
                "lang": "zh-CN",
                "title": "如何设计一个百万 QPS 秒杀系统？",
                "category": "案例分析",
                "difficulty": "困难",
                "type": "professional",
                "ideal": truncate(body, 4800),
                "tags": ["八股文", "系统设计", "高并发"],
                "assessment_points": "考察分层漏斗、缓存、异步削峰与兜底限流等架构能力。",
            }
        )
    return items


def _extract_table_row(text: str, needle: str) -> str:
    idx = text.find(needle[:6])
    if idx < 0:
        return ""
    snippet = text[idx : idx + 2200]
    return truncate(snippet, 4800)


def parse_ai_tables(text: str) -> list[dict]:
    topics = [
        ("AI-POST-01", "LoRA 与 QLoRA 微调原理", "LoRA"),
        ("AI-POST-02", "PPO vs DPO vs GRPO 强化学习对齐演进", "PPO"),
        ("AI-POST-03", "KV Cache 显存计算与 FlashAttention / PagedAttention", "KV Cache"),
        ("AI-POST-04", "主流推理框架选型与解码采样参数", "推理引擎选型"),
    ]
    items: list[dict] = []
    for qid, title, needle in topics:
        items.append(
            {
                "id": qid,
                "lang": "zh-CN",
                "title": title,
                "category": "专业知识",
                "difficulty": "困难",
                "type": "professional",
                "ideal": _extract_table_row(text, needle),
                "tags": ["AI大模型", "后训练", "推理"],
                "assessment_points": "考察大模型训练对齐与推理部署的工程理解。",
            }
        )
    return items


def dedupe_by_id(items: list[dict], taken: set[str]) -> list[dict]:
    out: list[dict] = []
    for item in items:
        qid = item["id"]
        if qid in taken:
            continue
        taken.add(qid)
        out.append(item)
    return out


def _strip_nones(item: dict) -> dict:
    return {k: v for k, v in item.items() if v is not None}


def emit_seed_py(all_items: list[dict]) -> None:
    header = '''"""Interview questions imported from handbook PDFs (auto-generated).

Re-generate:
  cd backend && python3 scripts/generate_pdf_seed.py
"""

from __future__ import annotations

SEED_PDF_IMPORT_QUESTIONS: list[dict] = '''
    cleaned = [_strip_nones(item) for item in all_items]
    body = pprint.pformat(cleaned, width=100, sort_dicts=False)
    OUT_PATH.write_text(header + body + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract interview questions from handbook PDFs or verify seed.")
    parser.add_argument("--input-dir", type=str, default=None, help="Directory containing source PDF handbooks")
    parser.add_argument("--check", action="store_true", help="Verify existing pdf_import_seed.py without overwriting")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON output")
    args = parser.parse_args()

    pdf_paths = resolve_pdf_paths(args.input_dir)
    missing_pdfs = [k for k, p in pdf_paths.items() if not p.is_file()]

    if args.check or missing_pdfs or PdfReader is None:
        if OUT_PATH.is_file():
            sys.path.insert(0, str(ROOT))
            from app.data.pdf_import_seed import SEED_PDF_IMPORT_QUESTIONS

            payload = {
                "ok": True,
                "mode": "verified_existing_seed",
                "seed_file": str(OUT_PATH.relative_to(REPO_ROOT)),
                "total_questions": len(SEED_PDF_IMPORT_QUESTIONS),
                "missing_source_pdfs": missing_pdfs,
            }
            if args.json:
                print(json.dumps(payload, ensure_ascii=False))
            else:
                print(
                    f"[pdf-seed] Verified existing {OUT_PATH.relative_to(REPO_ROOT)} "
                    f"({len(SEED_PDF_IMPORT_QUESTIONS)} questions)."
                )
            return 0
        print(f"[pdf-seed] Error: Missing PDFs {missing_pdfs} and {OUT_PATH} does not exist.", file=sys.stderr)
        return 1

    taken = existing_seed_ids()
    all_items: list[dict] = []

    alg_text = read_pdf_text(pdf_paths["alg"])
    bagu_text = read_pdf_text(pdf_paths["bagu"])
    ai_text = read_pdf_text(pdf_paths["ai"])

    parsers = [
        ("alg_top30", parse_alg_top30(alg_text)),
        ("alg_templates", parse_alg_templates(alg_text)),
        ("alg_l150", parse_alg_leetcode150_topics(alg_text)),
        ("alg_acm", parse_alg_acm(alg_text)),
        (
            "bagu_q",
            parse_q_sections(
                bagu_text,
                "BAGU",
                "八股文",
                ["八股文", "面经"],
            ),
        ),
        ("bagu_tables", parse_bagu_tables(bagu_text)),
        (
            "ai_q",
            parse_q_sections(
                ai_text,
                "AI",
                "AI大模型",
                ["AI大模型", "AIGC"],
            ),
        ),
        ("ai_tables", parse_ai_tables(ai_text)),
    ]

    counts: dict[str, int] = {}
    for name, batch in parsers:
        batch = dedupe_by_id(batch, taken)
        counts[name] = len(batch)
        all_items.extend(batch)

    emit_seed_py(all_items)

    if args.json:
        print(json.dumps({"ok": True, "mode": "regenerated", "total_questions": len(all_items), "counts": counts}, ensure_ascii=False))
    else:
        print("Wrote", OUT_PATH, "total", len(all_items))
        for k, v in counts.items():
            print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
