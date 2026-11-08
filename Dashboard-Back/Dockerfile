# Serviço de gráficos e API do LC PETRO (servico-graficos), para o Coolify, Render ou qualquer host com Docker.
# Fica na raiz do repositório dashboard-backend.
FROM python:3.12-slim

# fontes compatíveis com Arial e Times New Roman (Liberation), usadas nos gráficos padrão Origin
RUN apt-get update && apt-get install -y --no-install-recommends fonts-liberation curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY servico-graficos/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY servico-graficos/*.py ./
COPY servico-graficos/graficos ./graficos

ENV MPLCONFIGDIR=/tmp/matplotlib \
    PYTHONUNBUFFERED=1 \
    SUPABASE_URL=https://dashboard-subapase.lcpetro.io \
    SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5NDA5NDUwMCwiZXhwIjo0OTQ5NzY4MTAwLCJyb2xlIjoiYW5vbiJ9.9Wc-sv33y1EG_2HYsr-HelAyfbpIqyve4lfx82PjvVQ
EXPOSE 8010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:${PORT:-8010}/saude || exit 1

# Atrás do proxy do Coolify/Traefik ou Render, o endereço do cliente vem do X-Forwarded-For.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8010} --workers 2 --proxy-headers --forwarded-allow-ips='*'"]
