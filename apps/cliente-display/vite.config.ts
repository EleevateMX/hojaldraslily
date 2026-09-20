import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@lily/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily · Pantalla",
      corto: "Pantalla",
      descripcion: "La pantalla de folios: a quién le toca recoger su pedido.",
    }),
  ],
  server: { port: 5184 },
})
