import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="edgewise-tests-") as directory, socket.socket() as reserved:
        root = Path(directory)
        for relative in ("backend/app", "backend/tests", "backend/scripts", "docs", "scripts"):
            shutil.copytree(repo / relative, root / relative, ignore=shutil.ignore_patterns("__pycache__"))

        # Reserve a loopback port without listening so tests cannot reach a development database.
        reserved.bind(("127.0.0.1", 0))
        port = reserved.getsockname()[1]
        backend = root / "backend"
        env = {
            **os.environ,
            "APP_ENV": "test",
            "MONGODB_URI": f"mongodb://127.0.0.1:{port}",
            "MONGODB_STRICT_LIVE": "false",
            "REDIS_URL": f"redis://127.0.0.1:{port}/0",
            "PYTHONPATH": os.pathsep.join((str(backend), str(backend / "tests"))),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        result = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", "tests", *sys.argv[1:]],
            cwd=backend,
            env=env,
        )
        return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
