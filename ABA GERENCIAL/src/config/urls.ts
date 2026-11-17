// Endereço do dashboard de visualização (o botão "Abrir Dashboard Visual", os links das importações e o
// retorno do e-mail de redefinição de senha). VITE_URL_DASHBOARD troca o padrão (ex.: outro ambiente).
const PADRAO = 'https://dashboard.lcpetro.io'
const configurado = String(import.meta.env.VITE_URL_DASHBOARD || '').replace(/\/+$/, '')
const rodandoLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
const ehLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(configurado)

// um endereço de localhost herdado do ambiente (ex.: variável antiga no Coolify) só vale quando o painel
// também roda no computador local
export const URL_DASHBOARD = configurado && (rodandoLocal || !ehLocal) ? configurado : PADRAO
