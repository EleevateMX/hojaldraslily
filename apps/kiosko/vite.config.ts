import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily · Autoservicio",
      corto: "Kiosko",
      descripcion: "El menú del día en la barra: el cliente arma su pedido y pasa a pagar.",
    }),
  ],
  server: { port: 5186 },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
