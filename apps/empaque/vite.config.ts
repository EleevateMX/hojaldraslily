import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily · Empaque",
      corto: "Empaque",
      descripcion: 'Qué hay que empacar y para qué hora, y entregar y cobrar el encargo.',
    }),
  ],
  server: { port: 5189 },
})
