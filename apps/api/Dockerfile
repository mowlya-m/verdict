# Two stages so the runtime image carries no build toolchain and no test deps.
FROM python:3.12-slim AS build
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY pyproject.toml ./
COPY src ./src
RUN pip install --prefix=/install .

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

# Never run the API as root. If the container is ever compromised the blast
# radius should stop at a user that owns nothing.
RUN useradd --create-home --shell /usr/sbin/nologin verdict
COPY --from=build /install /usr/local
COPY --from=build /app/src ./src
USER verdict

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=2).status==200 else 1)"

# One worker. The engine is CPU-light and stateless, so concurrency comes from
# the async loop rather than from processes. Raise WEB_CONCURRENCY if that
# stops being true.
CMD ["sh", "-c", "uvicorn verdict.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]
