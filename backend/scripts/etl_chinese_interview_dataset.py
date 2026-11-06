#!/usr/bin/env python3
"""Stream-based ETL pipeline for 面试数据集/Chinese_interview_large.json (950,504 lines).

Filters high-signal technical, product, and behavioral interview questions from the
Alpaca-formatted dataset, enriches them with Edgewise assessment points, answer structures,
and follow-up probing prompts, and writes:
  - backend/app/data/dataset_import_seed.py (SEED_DATASET_QUESTIONS)
  - backend/app/data/dataset_questions_seed.json (JSON manifest for Autoloop audit)

Usage:
  python3 backend/scripts/etl_chinese_interview_dataset.py
  python3 backend/scripts/etl_chinese_interview_dataset.py --limit-per-category 12 --json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pprint
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = ROOT / "面试数据集" / "Chinese_interview_large.json"
OUT_PY_PATH = ROOT / "backend" / "app" / "data" / "dataset_import_seed.py"
OUT_JSON_PATH = ROOT / "backend" / "app" / "data" / "dataset_questions_seed.json"

CATEGORY_RULES: list[dict[str, Any]] = [
    {
        "category": "后端与架构",
        "prefix": "DS-BE",
        "type": "general",
        "keywords": ["Redis", "MySQL", "索引", "事务", "并发", "分布式", "微服务", "缓存穿透", "消息队列", "Kafka", "死锁", "TCP", "HTTP"],
        "assessment": "考察分布式架构理解、底层存储机制与高并发故障排查能力。",
        "structure": "核心概念定义 → 底层原理/数据结构 → 生产环境痛点与容灾方案 → 量化指标。",
        "follow_ups": [
            "在你过往项目中，这个机制遇到过什么样的极端流量或故障？",
            "如果让你对比两种主流替代方案，你的选型量化依据是什么？",
        ],
    },
    {
        "category": "前端与工程化",
        "prefix": "DS-FE",
        "type": "general",
        "keywords": ["React", "Vue", "虚拟DOM", "浏览器渲染", "闭包", "事件循环", "Event Loop", "Webpack", "Vite", "跨域", "性能优化", "SSR"],
        "assessment": "考察浏览器运行时机制、现代前端框架底层原理与工程化性能调优。",
        "structure": "机制概述 → 运行时执行链路 → 常见性能瓶颈 → 真实工程落地效果。",
        "follow_ups": [
            "如果线上出现首屏 LCP 劣化或内存泄漏，你会用什么工具定位？",
            "这个特性在低端移动设备或弱网环境下有哪些边界隐患？",
        ],
    },
    {
        "category": "算法与AI工程",
        "prefix": "DS-AI",
        "type": "general",
        "keywords": ["Transformer", "注意力机制", "过拟合", "梯度消失", "RAG", "微调", "LoRA", "交叉熵", "动态规划", "时间复杂度", "二叉树", "哈希冲突"],
        "assessment": "考察算法复杂度直觉、大模型/机器学习基础理论与工程落地边界。",
        "structure": "数学/算法直觉 → 核心公式或复杂度 → 优缺点权衡 → 实际业务场景调优。",
        "follow_ups": [
            "当样本分布严重偏斜或推理延迟受限时，你会怎么裁剪该方案？",
            "如果不用外部大模型 API，如何用轻量规则或传统算法做降级兜底？",
        ],
    },
    {
        "category": "产品与业务分析",
        "prefix": "DS-PM",
        "type": "case",
        "keywords": ["留存率", "转化率", "A/B测试", "用户增长", "需求优先级", "漏斗分析", "商业模式", "竞品分析", "DAU", "北极星指标"],
        "assessment": "考察结构化拆解业务问题、实验因果推断（A/B 测试）与指标归因能力。",
        "structure": "明确业务目标与阶段 → MECE 拆解归因维度 → 提出假设与实验验证 → 风险权衡。",
        "follow_ups": [
            "如果 A/B 实验观察到短期转化提升但 7 日留存下滑，你如何决策？",
            "在缺少历史基线数据时，你如何估算该方案的 ROI 上下界？",
        ],
    },
    {
        "category": "行为与抗压追问",
        "prefix": "DS-BQ",
        "type": "behavioral",
        "keywords": ["项目经历", "最大挑战", "团队冲突", "延期", "跨部门沟通", "失败经历", "优缺点", "职业规划", "压力最大"],
        "assessment": "考察 STAR 叙事真实性、个人行动颗粒度与抗追问自洽性（反背稿核验）。",
        "structure": "具体情境（含时间/规模） → 你的独立职责 → 关键取舍行动 → 可核验量化结果。",
        "follow_ups": [
            "请挑出其中最关键的一个决策节点：当时具体的反对意见是什么？你如何说服的？",
            "如果剥离团队光环，完全由你个人独立交付的增量贡献占多少比例？",
        ],
    },
]

NOISE_PATTERNS = re.compile(
    r"翻译|写一首诗|小说|童话|食谱|星座|算命|笑话|作文|文言文|求医|法律条文|润色以下|改写这段",
    re.I,
)
INTERVIEW_SIGNAL = re.compile(
    r"面试|请简述|什么是|如何理解|如何解决|为什么|区别是什么|原理|怎么设计|如何优化|请分析|谈谈你对|怎么处理"
)


def _clean_title(raw_q: str) -> str:
    text = raw_q.strip()
    text = re.sub(r"^(问：|问题：|面试官：|Q:|Question:)\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text[:85].strip()


def _infer_difficulty(title: str, answer: str) -> str:
    length = len(answer)
    if any(k in title for k in ("分布式", "高并发", "底层原理", "架构设计", "死锁", "A/B测试", "过拟合")):
        return "困难"
    if length > 260:
        return "中等"
    return "简单"


def _iter_dataset_objects(path: Path, max_lines: int = 250000):
    """Stream objects out of a huge JSON array without loading 950k lines into RAM at once."""
    if not path.is_file():
        return
    buf: list[str] = []
    inside = False
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line_no, raw_line in enumerate(f, start=1):
            if line_no > max_lines:
                break
            stripped = raw_line.strip()
            if stripped == "{":
                inside = True
                buf = ["{"]
            elif inside:
                if stripped in ("},", "}"):
                    buf.append("}")
                    inside = False
                    try:
                        yield json.loads("\n".join(buf))
                    except Exception:
                        pass
                    buf = []
                else:
                    buf.append(raw_line.rstrip("\n"))


def extract_curated_questions(limit_per_category: int = 12) -> list[dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {r["category"]: [] for r in CATEGORY_RULES}
    seen_hashes: set[str] = set()

    for obj in _iter_dataset_objects(DATASET_PATH):
        inp = str(obj.get("input") or "").strip()
        inst = str(obj.get("instruction") or "").strip()
        out = str(obj.get("output") or "").strip()

        question_raw = inp if (10 <= len(inp) <= 90) else inst if (10 <= len(inst) <= 90 and not inp) else ""
        if not question_raw or len(out) < 80 or len(out) > 1200:
            continue
        if NOISE_PATTERNS.search(question_raw) or NOISE_PATTERNS.search(out):
            continue
        if not INTERVIEW_SIGNAL.search(question_raw):
            continue

        title = _clean_title(question_raw)
        if len(title) < 10 or len(title) > 72:
            continue
        norm_key = re.sub(r"\W+", "", title.lower())
        digest = hashlib.md5(norm_key.encode("utf-8")).hexdigest()[:12]
        if digest in seen_hashes:
            continue

        for rule in CATEGORY_RULES:
            cat = rule["category"]
            if len(buckets[cat]) >= limit_per_category:
                continue
            matched_kw = [kw for kw in rule["keywords"] if kw.lower() in (title + " " + out[:200]).lower()]
            if not matched_kw:
                continue

            seen_hashes.add(digest)
            idx = len(buckets[cat]) + 1
            ideal_excerpt = re.sub(r"\s+", " ", out).strip()[:360]
            buckets[cat].append(
                {
                    "id": f"{rule['prefix']}-{idx:03d}",
                    "lang": "zh-CN",
                    "title": title,
                    "category": cat,
                    "difficulty": _infer_difficulty(title, out),
                    "type": rule["type"],
                    "assessment_points": rule["assessment"],
                    "answer_structure": rule["structure"],
                    "follow_ups": list(rule["follow_ups"]),
                    "tags": ["ChineseInterviewLarge", cat] + matched_kw[:2],
                    "ideal": ideal_excerpt,
                }
            )
            break

        if all(len(v) >= limit_per_category for v in buckets.values()):
            break

    curated: list[dict[str, Any]] = []
    for rule in CATEGORY_RULES:
        curated.extend(buckets[rule["category"]])
    return curated


def main() -> int:
    parser = argparse.ArgumentParser(description="ETL Chinese_interview_large.json into Edgewise seed bank")
    parser.add_argument("--limit-per-category", type=int, default=10, help="Max curated items per category")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args()

    questions = extract_curated_questions(limit_per_category=args.limit_per_category)

    OUT_PY_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = (
        '"""Curated interview questions extracted from 面试数据集/Chinese_interview_large.json.\n\n'
        "Auto-generated by:\n"
        "  python3 backend/scripts/etl_chinese_interview_dataset.py\n"
        '"""\n\n'
        "from __future__ import annotations\n\n"
        "SEED_DATASET_QUESTIONS: list[dict] = "
    )
    body = pprint.pformat(questions, width=100, sort_dicts=False)
    OUT_PY_PATH.write_text(header + body + "\n", encoding="utf-8")

    manifest = {
        "source": str(DATASET_PATH.relative_to(ROOT)),
        "total_extracted": len(questions),
        "categories": {
            rule["category"]: sum(1 for q in questions if q["category"] == rule["category"])
            for rule in CATEGORY_RULES
        },
        "questions": questions,
    }
    OUT_JSON_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps({
            "ok": True,
            "total_extracted": len(questions),
            "categories": manifest["categories"],
            "out_py": str(OUT_PY_PATH.relative_to(ROOT)),
            "out_json": str(OUT_JSON_PATH.relative_to(ROOT)),
        }, ensure_ascii=False))
    else:
        print(f"[etl-dataset] Extracted {len(questions)} curated questions -> {OUT_PY_PATH.relative_to(ROOT)}")
        for cat, count in manifest["categories"].items():
            print(f"  - {cat}: {count} 题")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
