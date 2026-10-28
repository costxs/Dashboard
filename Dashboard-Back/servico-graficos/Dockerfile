FROM python:3.12-slim
# fontes métricas compatíveis com Arial e Times New Roman (Liberation)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY graficos ./graficos
COPY *.py ./
ENV MPLCONFIGDIR=/tmp/matplotlib
EXPOSE 8010
# para o Render use o Dockerfile da raiz do repositório (porta $PORT, um processo)
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8010} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
