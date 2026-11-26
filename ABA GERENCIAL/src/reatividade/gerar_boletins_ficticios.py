"""Gera boletins de RDA FICTÍCIOS no mesmo layout do boletim do laboratório (Planilha1 + Curva de calibração),
para testar o leitor e o cálculo sem usar dados reais. Códigos RDA9xx, nomes e valores inventados.

    python gerar_boletins_ficticios.py      ->  boletim_rda_calcita_ficticio.xlsx, boletim_rda_dolomita_ficticio.xlsx,
                                               boletins_rda_esperado.json (resultados calculados aqui, para os testes)
"""
import json
import math
import random
from pathlib import Path

from openpyxl import Workbook

AQUI = Path(__file__).parent
random.seed(7)


def boletim(nome, codigo, litologia, mineral, rpm, phi, taxa_alvo, cal_ca, dil_ca, cal_mg=None, dil_mg=None, ruido=0.002):
    wt, rho, mm = 10, 1.012, 60.052                       # ácido acético 10 wt% (valores fictícios de teste)
    c0 = wt / mm * 10 * rho
    d = 3.81
    area_c = math.pi * (d / 2) ** 2 / (1 - phi / 100)
    tempos = [0, 120, 240, 360, 480, 600, 900, 1200, 1500, 1800]
    # TR = 2·(-dH/dt)/Ac  ->  dH/dt = -TR·Ac/2
    dhdt = -taxa_alvo * area_c / 2
    abs0_ca, abs0_mg = 0.0005, 0.004
    linhas_ca, linhas_mg = [], []
    for t in tempos:
        h = c0 + dhdt * t
        consumo = c0 - h                                  # mol/L de H+ consumido
        if mineral == "calcita":
            ca = consumo / 2; mg = 0.0
        else:                                             # dolomita: metade do H+ vem do Ca, metade do Mg (aprox.)
            ca = consumo / 4 * random.uniform(0.95, 1.05) if t else 0; mg = consumo / 4 if t else 0
        ca_mgl_dil = ca * 1000 * 40.078 / dil_ca
        abs_ca = abs0_ca + cal_ca * ca_mgl_dil * (1 + random.uniform(-ruido, ruido) if t else 1)
        linhas_ca.append((f"{codigo}-T{len(linhas_ca)}", t, round(abs_ca, 9)))
        if cal_mg:
            mg_mgl_dil = mg * 1000 * 24.305 / dil_mg
            linhas_mg.append((f"{codigo}-T{len(linhas_mg)}", t, round(abs0_mg + cal_mg * mg_mgl_dil, 9)))

    wb = Workbook(); ws = wb.active; ws.title = "Planilha1"
    put = lambda c, v: ws.__setitem__(c, v)
    put("B2", f"Boletim de ensaios e resultados de experimentos de REATIVIDADE para amostras de {litologia}")
    put("K2", codigo); put("K3", "05/03/2026")
    put("B4", "DADOS INICIAIS DO EXPERIMENTO")
    put("B5", "Estudo:"); put("C5", f"Dissolução dinâmica da amostra {codigo} em HAc 10%, 45ºC, {rpm}RPM")
    put("F5", "Boletim feito por:"); put("G5", "Operador Fictício")
    put("I5", "Início do experimento:"); put("J5", "04/03/2026")
    put("B6", "Operadores:"); put("C6", "Operador Fictício"); put("I6", "Fim do experimento:"); put("J6", "05/03/2026")
    put("B8", "Nome do experimento:"); put("C8", f"Dissolução dinâmica {codigo}"); put("G8", "Observações:"); put("H8", "dados fictícios")
    put("B11", "Temperatura (°C):"); put("C11", 45); put("D11", "Volume de ácido (mL)"); put("E11", 750)
    put("G11", "Número de amostras coletadas:"); put("H11", 10); put("I11", "Massa antes (g):"); put("J11", 40.1234)
    put("B12", "Rotação (rpm):"); put("C12", rpm); put("D12", "Saturação:"); put("E12", "AUP"); put("I12", "Massa depois (g):"); put("J12", 39.9876)
    put("B13", "PETROFÍSICA BÁSICA"); put("H13", "RESULTADOS")
    for c, v in zip("BCDEF", ["Plugue", "Diâmetro", "Comprimento", "K exp", "ϕ"]): put(f"{c}14", v)
    for c, v in zip("CDEF", ["(cm)", "(cm)", "(mD)", "(%)"]): put(f"{c}15", v)
    put("B16", codigo); put("C16", d); put("D16", 1.5); put("F16", phi)
    put("B17", "FLUIDO ÁCIDO UTILIZADO"); put("H17", "EQUIPAMENTO E ANÁLISES AUXILIARES")
    put("B18", "Fluido:"); put("C18", "Ácido acético"); put("H18", "Secagem:"); put("I18", "Estufa")
    put("B19", "Concentração (wt%):"); put("C19", wt)
    put("B20", "Densidade (g/mL):"); put("C20", rho)
    put("B21", "Massa molar fluido (g/mol):"); put("C21", mm); put("H21", "Pré-tratamento:"); put("I21", "Limpeza das faces")
    put("B22", "RESULTADOS DA REAÇÃO")
    put("B23", "Diluição das amostras (mL):"); put("C23", dil_ca); put("E23", "*Curva de calibração em 10/02/2026")
    put("H23", "Diâmetro do disco (cm):"); put("I23", d)
    put("B24", "Equação da curva de calibração de Ca2+:"); put("C24", f"Abs = {cal_ca}[Ca2+]")
    put("H24", "Área da seção transversal do disco (cm2):"); put("I24", math.pi * (d / 2) ** 2)
    put("B25", "Massa molar Ca (g/mol):"); put("C25", 40.078)
    put("E25", "Concentração inicial do fluido (mol/L):"); put("F25", c0)
    put("H25", "Área inicial de reação (corrigida com a porosidade) (cm2):"); put("I25", area_c)
    cab = ["Amostra", "Tempo (s)", "Absorção (ua)", "Concentração diluída de Ca2+ (mg/L)", "Concentração real de Ca2+(mol/L)", "Concentração real de H+ (mol/L)"]
    for c, v in zip("BCDEFG", cab): put(f"{c}27", v)
    for i, (r, t, a) in enumerate(linhas_ca):
        put(f"B{28 + i}", r); put(f"C{28 + i}", t); put(f"D{28 + i}", a)
    if cal_mg:
        put("B39", "Diluição das amostras (mL):"); put("C39", dil_mg)
        put("B40", "Equação da curva de calibração de Mg2+:"); put("C40", f"Abs = {cal_mg}[Mg2+]"); put("E40", "*Curva de calibração em 11/02/2026")
        put("B41", "Massa molar Mg (g/mol):"); put("C41", 24.305)
        for c, v in zip("BCDEFG", [x.replace("Ca2+", "Mg2+") for x in cab]): put(f"{c}43", v)
        for i, (r, t, a) in enumerate(linhas_mg):
            put(f"B{44 + i}", r); put(f"C{44 + i}", t); put(f"D{44 + i}", a)
    # resultados "da planilha" (calculados aqui como o Excel faria)
    def taxa(fh):
        hs = []
        for i, (_, t, a) in enumerate(linhas_ca):
            ca = 0 if i == 0 else (a - linhas_ca[0][2]) / cal_ca * dil_ca / (1000 * 40.078)
            mg = 0
            if cal_mg and i:
                mg = (linhas_mg[i][2] - linhas_mg[0][2]) / cal_mg * dil_mg / (1000 * 24.305)
            hs.append((t, fh(ca, mg)))
        n = len(hs); mx = sum(t for t, _ in hs) / n; my = sum(h for _, h in hs) / n
        slope = sum((t - mx) * (h - my) for t, h in hs) / sum((t - mx) ** 2 for t, _ in hs)
        return 2 * -slope / area_c
    esperado = {}
    if mineral == "calcita":
        esperado["taxa"] = taxa(lambda ca, mg: c0 - 2 * ca)
        put("H14", "Taxa de reação (mol.cm-2.s-1)"); put("I14", esperado["taxa"])
    else:
        esperado["taxa_so_ca"] = taxa(lambda ca, mg: c0 - 4 * ca)
        esperado["taxa_ca_mg"] = taxa(lambda ca, mg: c0 - 2 * ca - 2 * mg)
        put("H14", "Taxa de reação só com Ca (mol.cm-2.s-1)"); put("I14", esperado["taxa_so_ca"])
        put("H15", "Taxa de reação com Ca e Mg (mol.cm-2.s-1)"); put("I15", esperado["taxa_ca_mg"])
    put("H16", "Perda de massa (%)"); put("I16", (40.1234 - 39.9876) / 40.1234)
    esperado.update(codigo=codigo, mineral=mineral, rpm=rpm, c0=c0, area_corrigida=area_c)
    cal = wb.create_sheet("Curva de calibração"); cal["B2"] = "Ca2+ (mg/L)"; cal["C2"] = "Absorção (ua)"
    for i, x in enumerate([1, 2, 5, 10, 20]): cal[f"B{3 + i}"] = x; cal[f"C{3 + i}"] = round(cal_ca * x, 6)
    wb.save(AQUI / nome)
    return esperado


esperado = {
    "calcita": boletim("boletim_rda_calcita_ficticio.xlsx", "RDA901", "Indiana", "calcita", 200, 16.0, 6.0e-8, 0.0251, 100),
    "dolomita": boletim("boletim_rda_dolomita_ficticio.xlsx", "RDA902", "Silurian", "dolomita", 500, 15.0, 2.0e-7, 0.0222, 1, 0.33, 25),
}
(AQUI / "boletins_rda_esperado.json").write_text(json.dumps(esperado, indent=2))
print(json.dumps(esperado, indent=2))
