import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'

export default defineConfig({
  plugins: [
    react(),
    pwaDeLily({
      nombre: "Hojaldras Lily Rewards",
      corto: "Rewards",
      descripcion: "Tu tarjeta de lealtad, el menú de la panadería y tus compras.",
      orientacion: 'portrait',
      // Solo Rewards lleva atajos y capturas: es la unica que tiene que
      // convencer a alguien de instalarla. En las del personal, el diálogo de
      // Android da igual -- se instalan una vez, en el local, a mano.
      categorias: ['food', 'lifestyle', 'shopping'],
      atajos: [
        { nombre: 'Mi código', corto: 'Código',
          descripcion: 'El código que muestras en caja', ruta: '?ir=inicio' },
        { nombre: 'Menú de hoy', corto: 'Menú',
          descripcion: 'Lo que hay en la barra', ruta: '?ir=menu' },
      ],
      capturas: [
        { archivo: 'captura-tarjeta.png', ancho: 585, alto: 1266,
          texto: 'Tu tarjeta, con el código que muestras en caja' },
        { archivo: 'captura-menu.png', ancho: 585, alto: 1266,
          texto: 'El menú vivo de la barra' },
      ],
    }),
  ],
  server: { port: 5187 },
})
