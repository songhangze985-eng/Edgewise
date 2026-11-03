from __future__ import annotations

from fastapi import HTTPException

_OPTIONAL = ("numpy", "pandas", "scipy")
_missing: list[str] | None = None


def missing_admin_stats_deps() -> list[str]:
    global _missing
    if _missing is None:
        out: list[str] = []
        for name in _OPTIONAL:
            try:
                __import__(name)
            except ImportError:
                out.append(name)
        _missing = out
    return list(_missing)


def admin_stats_deps_available() -> bool:
    return not missing_admin_stats_deps()


def require_admin_stats_deps() -> None:
    missing = missing_admin_stats_deps()
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "Research admin stats unavailable; install optional deps: "
                + ", ".join(missing)
            ),
        )
