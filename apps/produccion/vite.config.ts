import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily · Producción",
      corto: "Horno",
      descripcion: "Lo que hay que hornear hoy, en moldes, con su hora de salida.",
    }),
  ],
  server: { port: 5188 },
})
