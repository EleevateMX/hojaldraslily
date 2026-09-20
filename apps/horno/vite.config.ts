import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@lily/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: 'Hojaldras Lily · Horno',
      corto: 'Horno',
      descripcion: 'Lo que espera para entrar, lo que está adentro con su reloj, y lo que sale.',
    }),
  ],
  server: { port: 5190 },
})
