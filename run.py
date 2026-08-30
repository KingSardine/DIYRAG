import os
import sys
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def main():
    print("=" * 65)
    print("  Custom RAG Sandbox & Diagnostic Tool - Web Dashboard")
    print("=" * 65)

    frontend_dir = ROOT / "Frontend"
    frontend_dist = frontend_dir / "dist"

    print("\n[1/2] Checking Frontend build...")
    if not frontend_dist.exists() or not (frontend_dist / "index.html").exists():
        print("Building Frontend production bundle...")
        try:
            subprocess.run(["npm", "run", "build"], cwd=str(frontend_dir), shell=True, check=True)
            print("Frontend built successfully!")
        except Exception as e:
            print(f"Notice: Vite build skipped or pending ({e}).")

    print("\n[2/2] Launching Backend Web Server...")
    # Launch backend or development server
    try:
        import uvicorn
        print("Starting FastAPI server at http://localhost:8000 ...")
        # Auto-open browser disabled to avoid launching extra pages
        print("Auto-open browser is disabled (no pages will be opened).")

        uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
    except ImportError:
        print("FastAPI / uvicorn not found in current Python path.")
        print("Running Frontend in Vite development mode on http://localhost:3000 ...")
        subprocess.run(["npm", "run", "dev"], cwd=str(frontend_dir), shell=True)

if __name__ == "__main__":
    main()

