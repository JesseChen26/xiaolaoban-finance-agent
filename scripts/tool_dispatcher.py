import os
import runpy
import sys
from pathlib import Path


def resolve_script(script_arg):
    script_path = Path(script_arg)
    if script_path.is_absolute():
        return script_path

    root = Path(os.environ.get("APP_ROOT_OVERRIDE") or Path.cwd())
    candidate = root / "scripts" / script_path
    if candidate.exists():
        return candidate
    return script_path.resolve()


def main():
    if len(sys.argv) < 2:
        print("usage: investment-python.exe <script.py> [args...]", file=sys.stderr)
        return 2

    script_path = resolve_script(sys.argv[1])
    if not script_path.exists():
        print(f"script not found: {script_path}", file=sys.stderr)
        return 2

    sys.path.insert(0, str(script_path.parent))
    sys.path.insert(0, str(script_path.parent.parent))
    sys.argv = [str(script_path), *sys.argv[2:]]
    runpy.run_path(str(script_path), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
