# Serviço de gráficos do LC PETRO (padrão Origin)

Python + matplotlib + FastAPI. O gerencial manda os dados já tratados (leituras e etapas de
vazão) e a configuração escolhida na tela; o serviço devolve o gráfico em PNG, SVG ou PDF, ou uma
planilha pronta para abrir no Origin. **Nada é gravado no servidor.**

## Estilo Origin
Moldura nos 4 lados, marcas maiores e menores para dentro (espelhadas em cima e à direita), sem
grade, fonte Arial (no Linux usa a Liberation Sans, que tem as mesmas medidas), cores na sequência
do Origin. O SVG sai com texto editável (abre no Inkscape/Illustrator) e o PDF com fontes embutidas.

## Endpoints
- `GET  /saude`
- `POST /permeabilidade/grafico` → imagem. Modos: `por_vazao` (uma etapa), `painel` (uma por quadro),
  `combinado` (todas no mesmo eixo), `darcy` (ΔP × Q com a reta e o k).
- `POST /permeabilidade/origin` → .xlsx com duas colunas por vazão (Tempo, ΔP) e as linhas
  Long Name / Units / Comments que o Origin reconhece, mais a aba "Etapas".
- `POST /permeabilidade/planilha-etapas` → .xlsx separado por etapas (Planilha1 + Resumo). Se o pedido trouxer
  `grafico` (o mesmo corpo do `/grafico`), sai também a aba "Gráficos" com o gráfico único e o ΔP × Q em PNG.
Corpo: `{ leituras: [{t, dp, q}], etapas: [{ordem, q, t_inicio, t_fim, j_inicio, j_fim, dp_medio,
k_md, usada, cor, rotulo, marcador, visivel}], config: {...} }` (ver `graficos/permeabilidade.py`).
Exige `Authorization: Bearer <token da sessão do Supabase>`.

## Rodar na sua máquina
    python -m venv .venv && .venv\Scripts\activate      (Windows)   |  source .venv/bin/activate (Linux)
    pip install -r requirements.txt
    set MODO_DEV=1   (Windows)  |  export MODO_DEV=1          ← aceita pedido sem login, SÓ para teste local
    uvicorn app:app --port 8010 --reload          ← --reload: recarrega ao mudar o código
    python -m pytest testes        (precisa de: pip install pytest)

## Publicar na VM da UFPA (Debian, já com Nginx + HTTPS)
    sudo apt install -y python3-venv fonts-liberation
    sudo mkdir -p /opt/lcpetro-graficos && sudo cp -r app.py graficos requirements.txt /opt/lcpetro-graficos/
    cd /opt/lcpetro-graficos && sudo python3 -m venv .venv && sudo .venv/bin/pip install -r requirements.txt
    sudo cp .env.example .env && sudo nano .env          ← SUPABASE_URL, SUPABASE_ANON_KEY, ORIGENS_PERMITIDAS
    sudo cp lcpetro-graficos.service /etc/systemd/system/ && sudo systemctl enable --now lcpetro-graficos
    (cole nginx-graficos.conf no server HTTPS do Nginx)  &&  sudo nginx -t && sudo systemctl reload nginx
    curl https://SEU-DOMINIO/graficos/saude              ← {"ok": true}
Ou use o `Dockerfile` (Render, Railway ou docker na VM). Os dados dos ensaios são sigilosos:
prefira a VM da UFPA a um serviço de nuvem.
