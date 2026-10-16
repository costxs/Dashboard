"""Gera permeabilidade_ficticio.xlsx com o MESMO FORMATO da exportação do equipamento
(cabeçalho "Chave: valor" nas linhas 2-13, tabela de leituras a partir da linha 14),
com dados INVENTADOS: amostra TESTE-K, k verdadeiro = 78 mD, vazões 2 -> 4 -> 6 cm³/min
com pausa (Q = 0) e transiente de estabilização no início de cada etapa."""
import math, random
from datetime import datetime, timedelta
from openpyxl import Workbook

random.seed(7)
L, D, MU, K = 7.32, 3.79, 0.89, 78.0
A = math.pi * D * D / 4
C = 1000 * 14.696 / 60
def dp_ss(q): return C * q * MU * L / (A * K)

CAB = ['Hora', 'Tempo (s)', 'PAH1 (psi)', 'PAH2 (psi)', 'dPH1 (psi)', 'dPH1 (P2H1-P1H1) (psi)', 'dPH2 (psi)',
       'dPH2 (P2H2-P1H2) (psi)', 'PC (psi)', 'PBH1 (psi)', 'PBH2 (psi)', 'T. Estufa (oC)', 'Q (cm³/min)', 'Nome G1',
       'Volume atual G1 (cm³)', 'Volume bomb. parcial G1 (cm³)', 'Nome G2', 'Volume atual G2 (cm³)',
       'Volume bomb. parcial G2 (cm³)', 'Nome G3', 'Volume atual G3 (cm³)', 'Volume bomb. parcial G3 (cm³)', 'Nome G4',
       'Volume atual G4 (cm³)', 'Volume bomb. parcial G4 (cm³)', 'Permeabilidade H1 (mD)', 'Permeabilidade H2 (mD)',
       'Seleção do holder para PVBT', 'Aviso de alarme (binário)', 'Set Point', 'Tolerância de variação (%)',
       'Número de recidivas', 'Volume poroso (cm³)', 'PVBT parcial calculado', 'PVBT total calculado',
       'Volume produzido no H1 (cm³)', 'Volume produzido no H2 (cm³)']

wb = Workbook(); ws = wb.active; ws.title = 'Planilha2'
ws.append([])
for l in ['Usuário: TESTE', 'Data: 02/09/2026 15:05:46', 'Descrição da amostra: TESTE-K', 'Comprimento (cm): 7,32',
          'Diâmetro (cm): 3,79', 'Porosidade (%): 14,30', 'Viscosidade (cP): 0,89', 'Fluido de tratamento: KCl 2%',
          'Conteúdo da garrafa 1: ', 'Conteúdo da garrafa 2: AUP', 'Conteúdo da garrafa 3: KCl 2%', 'Conteúdo da garrafa 4: ']:
    ws.append([l])
ws.append(CAB)
t, vol, parcial = 0.2, 540.85, 0.0
h0 = datetime(2026, 9, 2, 15, 5, 46)
etapas = [(2, 300), (0, 20), (4, 300), (6, 300)]
for q, dur in etapas:
    t_ini = t
    while t < t_ini + dur:
        tau = t - t_ini
        dp = dp_ss(q) * (1 - math.exp(-tau / 25)) * (1 + random.gauss(0, 0.008)) if q > 0 else max(0.02, random.gauss(0.05, 0.01))
        vol -= q * 2 / 60; parcial += q * 2 / 60
        k_eq = C * q * MU * L / (A * dp) if q > 0 and dp > 0.05 else 0
        ws.append([h0 + timedelta(seconds=t), round(t, 1), 1239.2, 0, round(dp, 3), round(dp + random.gauss(56, 3), 2), 0, 0,
                   2745.7, 1179.0, 0, 40.0, q, None, 0, 0, 'AUP', 750.68, 0, 'KCl 2%', round(vol, 2), round(parcial, 2),
                   None, 0, 0, round(k_eq, 2), 0, 'Holder 1', 0, 3.61, 1, 3, 0, 0, 0, 0, 0])
        t += 2
wb.save('permeabilidade_ficticio.xlsx')
print('ok', ws.max_row, 'linhas; ΔP estável esperado:', [round(dp_ss(q), 3) for q in (2, 4, 6)])
