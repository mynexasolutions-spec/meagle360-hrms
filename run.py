#!/usr/bin/env python
"""
Runs the whole project (backend API + frontend dev server) with one command.

Usage:
    python run.py

Assumes one-time setup is already done:
    cd backend  && python -m venv venv && venv\\Scripts\\activate && pip install -r requirements.txt
    cd frontend && npm install

Stop both processes with Ctrl+C.
"""

import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

IS_WINDOWS = sys.platform == "win32"
VENV_PYTHON = BACKEND_DIR / "venv" / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python")


def stream_output(process: subprocess.Popen, prefix: str) -> None:
    for line in process.stdout:
        print(f"[{prefix}] {line}", end="")


def main() -> int:
    if not VENV_PYTHON.exists():
        print(f"Backend venv not found at {VENV_PYTHON}.")
        print("Run this first: cd backend && python -m venv venv && venv\\Scripts\\activate && pip install -r requirements.txt")
        return 1

    if not (FRONTEND_DIR / "node_modules").exists():
        print("Frontend dependencies not installed.")
        print("Run this first: cd frontend && npm install")
        return 1

    npm = shutil.which("npm.cmd" if IS_WINDOWS else "npm")
    if not npm:
        print("npm not found on PATH.")
        return 1

    backend_proc = subprocess.Popen(
        [str(VENV_PYTHON), "-m", "uvicorn", "app.main:app", "--reload", "--port", "8015"],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    frontend_proc = subprocess.Popen(
        [npm, "run", "dev"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    threads = [
        threading.Thread(target=stream_output, args=(backend_proc, "backend"), daemon=True),
        threading.Thread(target=stream_output, args=(frontend_proc, "frontend"), daemon=True),
    ]
    for t in threads:
        t.start()

    print("Backend  -> http://localhost:8015  (docs at /api/docs)")
    print("Frontend -> http://localhost:5173")
    print("Press Ctrl+C to stop both.\n")

    try:
        while backend_proc.poll() is None and frontend_proc.poll() is None:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for proc in (backend_proc, frontend_proc):
            if proc.poll() is None:
                proc.terminate()
        for proc in (backend_proc, frontend_proc):
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

    return 0


if __name__ == "__main__":
    sys.exit(main())
