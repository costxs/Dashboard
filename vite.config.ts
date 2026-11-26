import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Garante que a rota /ternario do React Router não seja interceptada pelo diretório estático public/ternario/,
// enquanto /ternario/index.html continua sendo servido diretamente para o <iframe>.
function rotaTernarioSpa(): Plugin {
  const middleware = (req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url === '/ternario' || req.url === '/ternario/' || req.url?.startsWith('/ternario?')) {
      req.url = '/index.html'
    }
    next()
  }
  return {
    name: 'rota-ternario-spa',
    configureServer(srv) {
      srv.middlewares.use(middleware)
    },
    configurePreviewServer(srv) {
      srv.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [rotaTernarioSpa(), react()],
})
