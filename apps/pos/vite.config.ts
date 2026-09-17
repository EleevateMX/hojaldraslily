import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily · Caja",
      corto: "Caja",
      descripcion: "Arma el pedido, cobra y manda las comandas. Turnos, encargos y corte de caja.",
    }),
  ],
  server: { port: 5181 },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
