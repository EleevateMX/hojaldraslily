import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily · Almacén",
      corto: "Almacén",
      descripcion: "Los encargos apartados, a qué hora los recogen, y el cobro al entregar.",
    }),
  ],
  server: { port: 5189 },
})
