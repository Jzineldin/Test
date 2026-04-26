# Production image for the AppetiteMatch API.
# Runs `alembic upgrade head` then uvicorn on $PORT (Render-style) or 8000.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# psycopg2 needs libpq; everything else is wheel-installable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq5 \
      libpq-dev \
      gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Drop the build-only deps once wheels are compiled.
RUN apt-get purge -y gcc libpq-dev && apt-get autoremove -y

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini .
# data/ ships outside api/ — the prod runtime auto-seeds carriers from
# the DB, so we don't need the bundled JSON files inside the image.

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
