import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily",
      corto: "Lily",
      descripcion: "Panadería de hojaldras en Mérida: el menú de hoy y tus recompensas.",
    }),
  ],
  server: { port: 5190 },
})
