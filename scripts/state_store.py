import json
import os
import time
from pathlib import Path


def save_json_atomic(path, payload):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(f".{target.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        with temp.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
        last_error = None
        for _ in range(8):
            try:
                os.replace(temp, target)
                last_error = None
                break
            except PermissionError as error:
                last_error = error
                time.sleep(0.15)
        if last_error:
            raise last_error
    finally:
        if temp.exists():
            try:
                temp.unlink()
            except OSError:
                pass
