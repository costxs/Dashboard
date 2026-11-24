"""Verificação do certificado HTTPS nas chamadas ao Supabase (a chave secreta vai nelas).

Sempre verifica. Numa rede que intercepta HTTPS (ex.: firewall que troca o certificado),
aponte SUPABASE_CA_BUNDLE para o arquivo .pem da autoridade dessa rede em vez de desligar.
"""
import os

VERIFICAR: bool | str = os.getenv("SUPABASE_CA_BUNDLE") or True
