"""Gera DOIS arquivos de acidificação com dados INVENTADOS, no formato do equipamento JBV:

acidificacao_ficticio.xlsx          exportação completa (cabeçalho "Chave: valor" + uma leitura a cada 2 s)
acidificacao_resumo_ficticio.xlsx   como o pesquisador separa à mão: só início e fim de cada trecho,
                                    sem cabeçalho, com a coluna "Coluna1" = "<fluido> @<Q>"

Sequência (mesma lógica dos ensaios reais, números inventados) — amostra TESTE-A, L 7,3 · D 3,8 · φ 14 %:
  KCl 2% (garrafa 3) @2 → BLEND (garrafa 4) @2 até o breakthrough → AUP (garrafa 2) @2 → @4 → @6.
O nome do fluido em uso não aparece em lugar nenhum: só a coluna "Volume atual Gn" da garrafa ativa cai.
Depois do breakthrough o ΔP fica num patamar de ~2 psi que não muda com a vazão (zero do transdutor)."""
import math, random
from datetime import datetime, timedelta
from openpyxl import Workbook

random.seed(11)
L, D, PHI = 7.3, 3.8, 0.14
VP = math.pi * D * D / 4 * L * PHI           # ~11,59 cm³
PVBT = 0.30
PATAMAR = 2.05
G = {2: ['AUP', 600.0, 0.0], 3: ['KCl 2%', 400.0, 0.0], 4: ['BLEND', 100.0, 0.0]}   # nome, atual, parcial
CAB = ['Hora', 'Tempo (s)', 'PAH1 (psi)', 'PAH2 (psi)', 'dPH1 (psi)', 'dPH1 (P2H1-P1H1) (psi)', 'dPH2 (psi)',
       'dPH2 (P2H2-P1H2) (psi)', 'PC (psi)', 'PBH1 (psi)', 'PBH2 (psi)', 'T. Estufa (oC)', 'Q (cm³/min)',
       'Nome G2', 'Volume atual G2 (cm³)', 'Volume bomb. parcial G2 (cm³)', 'Nome G3', 'Volume atual G3 (cm³)',
       'Volume bomb. parcial G3 (cm³)', 'Nome G4', 'Volume atual G4 (cm³)', 'Volume bomb. parcial G4 (cm³)',
       'Permeabilidade H1 (mD)', 'Permeabilidade H2 (mD)', 'Seleção do holder para PVBT', 'Aviso de alarme (binário)',
       'Set Point']
linhas, rotulos = [], []
t, ativa, filtro = 0.0, None, None
h0 = datetime(2026, 10, 5, 9, 12, 0)
A = math.pi * D * D / 4

def ler(q, dp, gar, temp, rot):
    global t, ativa, filtro
    if gar != ativa:                     # troca de garrafa: o parcial da anterior é zerado
        if ativa: G[ativa][2] = 0.0
        ativa = gar
    dv = q * 2 / 60
    G[gar][1] -= dv; G[gar][2] += dv
    filtro = dp if filtro is None else 0.7 * filtro + 0.3 * dp     # "Set Point" = ΔP filtrado
    k = 245 * q * 1.0 * L / (A * dp)
    linhas.append([h0 + timedelta(seconds=t), round(t, 2), 1300.0 + random.gauss(0, 1), 0, round(dp, 2),
                   round(dp + 56 + random.gauss(0, 1), 2), 0, 0, 2750.0, 1203.0, 0, temp, q,
                   G[2][0], round(G[2][1], 2), round(G[2][2], 2), G[3][0], round(G[3][1], 2), round(G[3][2], 2),
                   G[4][0], round(G[4][1], 2), round(G[4][2], 2), round(k, 2), 0, 'Holder 1', 0, round(filtro, 2)])
    rotulos.append(rot)
    t += 2

for i in range(300):                                   # KCl @2: ΔP sobe de 20 para 28 psi (dano)
    ler(2, (20 + 8 * (1 - math.exp(-i / 80))) * (1 + random.gauss(0, 0.01)), 3, 45.0, 'KCl 2% @2')
v, bt = 0.0, PVBT * VP
while v < bt + 0.2:                                    # BLEND @2 até um pouco depois do breakthrough
    v += 2 * 2 / 60
    x = min(v / bt, 1)
    dp = (28 * (1 - x ** 3) + PATAMAR * x ** 3) * (1 + random.gauss(0, 0.01)) if v < bt else PATAMAR + random.gauss(0, 0.03)
    ler(2, dp, 4, 43.0, 'BLEND @2')
for q, n in ((2, 150), (4, 100), (6, 60)):            # AUP depois: ΔP no patamar, não muda com Q
    for _ in range(n):
        ler(q, PATAMAR + random.gauss(0, 0.03), 2, 0.0, f'AUP @{q}')

wb = Workbook(); ws = wb.active; ws.title = 'Planilha2'
ws.append([])
for l in ['Usuário: TESTE', 'Data: 05/10/2026 09:12:00', 'Descrição da amostra: TESTE-A', 'Comprimento (cm): 7,3',
          'Diâmetro (cm): 3,8', 'Porosidade (%): 14,00', 'Viscosidade (cP): 1,0', 'Fluido de tratamento: ',
          'Conteúdo da garrafa 2: ', 'Conteúdo da garrafa 3: ', 'Conteúdo da garrafa 4: ']:
    ws.append([l])
ws.append(CAB)
for l in linhas: ws.append(l)
wb.save('acidificacao_ficticio.xlsx')

# resumo do pesquisador: 1ª, 2ª e última leitura de cada trecho, sem Hora, a partir da coluna B
wb = Workbook(); ws = wb.active; ws.title = 'Planilha1'
ws.append([]); ws.append([None] + CAB[1:] + ['Coluna1']); ws.append([])
i = 0
while i < len(linhas):
    j = i
    while j + 1 < len(linhas) and rotulos[j + 1] == rotulos[i]: j += 1
    for k in sorted({i, i + 1, j} if j > i else {i}):
        ws.append([None] + linhas[k][1:] + [rotulos[k]])
    i = j + 1
wb.save('acidificacao_resumo_ficticio.xlsx')
print('ok', len(linhas), 'leituras; VP =', round(VP, 3), 'cm³; ácido no BT =', round(bt, 3), 'cm³ (PVbt', PVBT, ')')
