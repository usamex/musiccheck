# MusicCheck API image. Build context: repository root (see compose.yaml).
# Debian trixie ships FFmpeg 7.1, matching the version the test suite was verified with.
FROM python:3.12-slim-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app
# Dependency layer first (cached until uv.lock changes).
COPY pyproject.toml uv.lock .python-version ./
COPY services/api/pyproject.toml services/api/pyproject.toml
COPY services/recognition/pyproject.toml services/recognition/pyproject.toml
RUN uv sync --frozen --no-dev --no-install-workspace

COPY services/api services/api
COPY services/recognition services/recognition
RUN uv sync --frozen --no-dev

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    MUSICCHECK_ALEMBIC_INI=/app/services/api/alembic.ini \
    MUSICCHECK_DATA_DIR=/data

RUN useradd --system --uid 10001 --home /data app && mkdir -p /data && chown app /data
USER app
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"

# Apply migrations, then serve.
CMD ["sh", "-c", "python -m musiccheck_api.migrate && exec musiccheck-api"]
