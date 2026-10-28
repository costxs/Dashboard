# Serviço de gráficos e API do LC PETRO (servico-graficos), para o Render ou qualquer host com Docker.
# Fica na raiz do repositório dashboard-backend: o Render procura o Dockerfile aqui.
FROM python:3.12-slim

# fontes compatíveis com Arial e Times New Roman (Liberation), usadas nos gráficos padrão Origin
RUN apt-get update && apt-get install -y --no-install-recommends fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY servico-graficos/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY servico-graficos/*.py ./
COPY servico-graficos/graficos ./graficos

ENV MPLCONFIGDIR=/tmp/matplotlib \
    PYTHONUNBUFFERED=1
EXPOSE 8010

# o Render informa a porta em $PORT; fora dele, 8010. Um processo só: cabe nos 512 MB do plano gratuito.
# --proxy-headers: atrás do proxy do Render, o endereço do cliente vem do X-Forwarded-For.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8010} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
