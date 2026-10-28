"""Gera arquivos INVENTADOS no formato do equipamento DCI (log .tsv do software aberto no Excel):

dci_permeabilidade_ficticio.xlsx    amostra TESTE-D (D 1,00 in · L 2,00 in · φ 15 %), água pelo acumulador 1,
                                    Q = 1 → 2 → 4 ml/min, k verdadeiro = 20 mD
dci_acidificacao_ficticio.xlsx      água antes (acumulador 3) @0.5 → ácido (acumulador 2) @0.5 até o breakthrough
                                    (PVbt = 0,60 contando o volume morto de 0,4 ml) → água depois (acumulador 1) @0.5 → @2.
                                    + aba "Planilha1" como o pesquisador copia (tabela a partir da coluna C, coluna de rótulos)
dci_acidificacao_sem_bt_ficticio.xlsx  igual, mas o ácido NÃO abre caminho: o ΔP sobe (dano)

Formato igual ao DCI: números como texto com 6 casas, tempo em horas, polegadas, DPBtot = DP1 + DP2 + DP3."""
import math, random
from openpyxl import Workbook

D_IN, L_IN, PHI = 1.0, 2.0, 15.0
D, L = D_IN * 2.54, L_IN * 2.54
A = math.pi * D * D / 4
VP = A * L * PHI / 100
C = 1000 * 14.696 / 60
COLS = ['Date (MM/DD/YY)', 'Time', 'Timestamp (hours)', 'VPA 1 Volume Pumped (ml)', 'VPA 1 Pressure (psi)', 'VPA 1 Flow Rate (ml/min)',
        'VPA 3 Volume Pumped (ml)', 'VPA 3 Pressure (psi)', 'VPA 3 Flow Rate (ml/min)', 'VPA 4 Volume Pumped (ml)', 'VPA 4 Pressure (psi)',
        'VPA 4 Flow Rate (ml/min)', 'VPA 5 Volume Pumped (ml)', 'VPA 5 Pressure (psi)', 'VPA 5 Flow Rate (ml/min)', 'Oven Temp (ºC)',
        'Core B Upstream Pressure (PP1B) (psi)', 'Core B Downstream Pressure (PP2B) (psi)', 'Core B Differential Pressure 1 (DP1B) (psi)',
        'Core B Differential Pressure 2 (DP2B) (psi)', 'Core B Differential Pressure 3 (DP3B) (psi)', 'Core B Confining Pressure (PCB) (psi)',
        'Core B Triaxial Pressure (PTB) (psi)', 'Core B Fluid Temp. In (°C)', 'Core B Fluid Temp. Out (°C)', 'Accum. 1 Vol (ml)',
        'Accum. 2 Vol (ml)', 'Accum. 3 Vol (ml)', 'Accum. 4 Vol (ml)', 'Permeability 1B (mD)', 'Permeability 2B (mD)',
        'Core B Differential Pressure Total (DPBtot) (psi)', 'DPB Diff. (psi)', 'Notes']
f6 = lambda x: f"{x:.6f}"


def gerar(nome, projeto, etapas, data='10/05/2026', inicio='9:00:00 AM', copia=False):
    """etapas: lista de (rotulo, acumulador, q, duração_s, função ΔP(i, t_rel, vol_no_trecho))"""
    random.seed(3)
    acc = {1: 400.0, 2: 150.0, 3: 600.0, 4: 0.0}
    vpa1, t, linhas, rotulos = 0.0, 0.0, [], []
    for rot, g, q, dur, fdp in etapas:
        v_tr = 0.0
        for i in range(int(dur)):
            qm = q * (1 + random.gauss(0, 0.012 if q < 1 else 0.002))
            dv = q / 60
            acc[g] -= dv; vpa1 += dv; v_tr += dv
            dp = max(fdp(i, i, v_tr) * (1 + random.gauss(0, 0.01)) + random.gauss(0, 0.02), 0.0)
            d1, d3 = dp * 0.45 + random.gauss(0, 0.01), random.gauss(0, 0.02)
            d2 = dp - d1 - d3
            k1 = C * q * 1.0 * L / (A * dp) if dp > 0.05 else 0
            linhas.append([data, inicio, f6(t / 3600 + 1e-6), f6(vpa1), f6(500 + 2 * dp), f6(qm), '20.500000', '1100.000000', f6(random.gauss(0, 0.02)),
                           '23.000000', '1500.000000', f6(random.gauss(0, 0.05)), '18.400000', '1700.000000', f6(random.gauss(0, 0.05)), '50.000000',
                           f6(1000 + dp), f6(1000.0), f6(d1), f6(d2), f6(d3), '1500.000000', '1660.000000', '50.000000', '50.000000',
                           f6(acc[1]), f6(acc[2]), f6(acc[3]), f6(acc[4]), f6(k1), '0.000000', f6(dp), f6(d1 - d2), ''])
            rotulos.append(rot)
            t += 1
    wb = Workbook(); ws = wb.active; ws.title = nome.replace('_ficticio', '')[:31]
    ws.append([f'Column{i}' for i in range(1, len(COLS) + 1)])
    cab = [('Log File Path', f'C:\\\\Experimentos\\\\{projeto}.tsv'), ('Log Start Time', f'{data}:{inicio}'), ('Project Name', projeto),
           ('Operator', 'TESTE'), ('Sample ID Core A', ''), ('Diam Core A (in)', '0.010000'), ('Length Core A (in)', '0.010000'),
           ('Porosity Core A (%)', '0.000000'), ('Pore Volume Core A (ml)', '0.000000'), ('Sample ID Core B', 'TESTE-D'),
           ('Diam Core B (in)', f6(D_IN)), ('Length Core B (in)', f6(L_IN)), ('Porosity Core B (%)', f6(PHI)), ('Pore Volume Core B (ml)', f6(VP)),
           ('Accum. 1 Viscosity (cP)', '1.000000'), ('Accum. 2 Viscosity (cP)', '1.000000'), ('Accum. 3 Viscosity (cP)', '1.000000'),
           ('Accum. 4 Viscosity (cP)', '1.000000')]
    for k, v in cab:
        ws.append([k, v] + [''] * (len(COLS) - 2))
    for _ in range(5):
        ws.append([''] * len(COLS))
    ws.append(COLS)
    for l in linhas:
        ws.append(l)
    if copia:   # cópia do pesquisador: a partir da coluna C, números de verdade, coluna de rótulo no fim
        p = wb.create_sheet('Planilha1')
        p.append([]); p.append([]); p.append([])
        p.append([None, None] + COLS[2:-1] + ['Coluna1'])
        for l, r in zip(linhas, rotulos):
            p.append([None, None] + [float(x) for x in l[2:-1]] + [r])
    wb.save(f'{nome}.xlsx')
    return VP


K = 20.0
dp_darcy = lambda q: C * q * 1.0 * L / (A * K)
# --- permeabilidade: 1 → 2 → 4 ml/min, transiente subindo do patamar anterior
ant = [0.0]
def etapa(q):
    a0 = ant[0]; ant[0] = dp_darcy(q)
    return lambda i, tr, v, a0=a0, q=q: a0 + (dp_darcy(q) - a0) * (1 - math.exp(-tr / 40))
gerar('dci_permeabilidade_ficticio', 'TESTE-D Permeabilidade', [('Permeabilidade 1', 1, 1.0, 600, etapa(1.0)),
      ('Permeabilidade 2', 1, 2.0, 400, etapa(2.0)), ('Permeabilidade 3', 1, 4.0, 300, etapa(4.0))])

# --- acidificação com breakthrough
MORTO, PVBT, Q = 0.4, 0.60, 0.5
v_bt = PVBT * VP + MORTO                      # volume total de ácido injetado até o breakthrough
dp0 = dp_darcy(Q)                              # ΔP com água antes
PAT = 0.30
acido = lambda i, tr, v: (dp0 * (1 - min(v / v_bt, 1) ** 4) + PAT * min(v / v_bt, 1) ** 4) if v < v_bt else PAT
dur_acido = (v_bt + 0.15) / Q * 60
vp = gerar('dci_acidificacao_ficticio', 'TESTE-D HCl[15 wt%] @0.5 T50', [
    ('Água antes @0.5', 3, Q, 900, lambda i, tr, v: dp0), ('Ácido @0.5', 2, Q, dur_acido, acido),
    ('Água depois @0.5', 1, Q, 400, lambda i, tr, v: PAT), ('Água depois @2.0', 1, 2.0, 300, lambda i, tr, v: PAT)], copia=True)
# --- acidificação SEM breakthrough (dano: ΔP sobe)
gerar('dci_acidificacao_sem_bt_ficticio', 'TESTE-D HCl[15 wt%] @0.5 T50', [
    ('Água antes @0.5', 3, Q, 600, lambda i, tr, v: dp0), ('Ácido @0.5', 2, Q, 600, lambda i, tr, v: dp0 * (1 + 2 * tr / 600)),
    ('Água depois @0.5', 1, Q, 400, lambda i, tr, v: dp0 * 5)])
print('ok; VP =', round(vp, 4), 'ml; ΔP água antes =', round(dp0, 3), 'psi; PVbt esperado (com volume morto 0,4) =', PVBT)
