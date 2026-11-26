# Build stage (Frontend Dashboard - LC PETRO)
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Variáveis em tempo de build do Vite (com padrão apontando para o Coolify do LC PETRO)
ARG VITE_SUPABASE_URL=https://dashboard-subapase.lcpetro.io
ARG VITE_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc5NDA5NDUwMCwiZXhwIjo0OTQ5NzY4MTAwLCJyb2xlIjoiYW5vbiJ9.9Wc-sv33y1EG_2HYsr-HelAyfbpIqyve4lfx82PjvVQ
ARG VITE_URL_GRAFICOS=https://dashboard-back.lcpetro.io

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_URL_GRAFICOS=$VITE_URL_GRAFICOS

RUN npm run build

# Production stage (Nginx com suporte a rotas SPA do React Router)
FROM nginx:alpine

RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;\n\
    # index.html sempre revalida: cada deploy aparece sem precisar limpar o cache\n\
    location / {\n\
        add_header Cache-Control "no-cache, must-revalidate" always;\n\
        try_files $uri /index.html;\n\
    }\n\
    # arquivos do build têm hash no nome: podem ficar em cache por 1 ano\n\
    location /assets/ {\n\
        add_header Cache-Control "public, max-age=31536000, immutable" always;\n\
        try_files $uri =404;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

