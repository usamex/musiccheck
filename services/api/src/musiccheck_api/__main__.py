"""``musiccheck-api`` / ``python -m musiccheck_api``: run the API with uvicorn."""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "musiccheck_api.main:create_app",
        factory=True,
        host=os.environ.get("MUSICCHECK_HOST", "0.0.0.0"),
        port=int(os.environ.get("MUSICCHECK_PORT", "8000")),
        proxy_headers=True,
    )


if __name__ == "__main__":
    main()
