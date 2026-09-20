import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pwaDeLily } from '@shake/pwa'

export default defineConfig({
  plugins: [
    react(),
    // El `corto` es lo que se lee DEBAJO del icono en la barra de tareas.
    // Decia "Horno" de cuando producir y hornear eran la misma mesa; ahora
    // el Horno es otra app y dos iconos que dicen lo mismo no se distinguen
    // por mas que se les cambie el color.
    pwaDeLily({
      nombre: 'Hojaldras Lily · Producción',
      corto: 'Producción',
      descripcion: 'Cuántos moldes van armados, de los que se pidieron.',
    }),
  ],
  server: { port: 5188 },
})
