import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@lily/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily · Gerencia",
      corto: "Admin",
      descripcion: "Ventas, producción, inventario y el estado de la tienda a distancia.",
    }),
  ],
  server: { port: 5185 },
})
