#!/usr/bin/env bash
# Regenerate packages/shared/openapi.json from the FastAPI app (the machine-readable contract).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
uv run python - <<'PY'
import json
from pathlib import Path
from musiccheck_api.main import create_app

out = Path("packages/shared/openapi.json")
out.write_text(json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n")
print(f"wrote {out}")
PY
