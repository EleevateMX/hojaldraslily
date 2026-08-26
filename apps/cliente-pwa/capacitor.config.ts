import type { CapacitorConfig } from '@capacitor/cli'

/**
 * La misma app, envuelta para App Store y Play Store.
 *
 * `webDir: 'dist'` empaqueta el sitio DENTRO de la app en vez de apuntar a
 * rewards.hojaldraslily.com con `server.url`. Se puede hacer de las dos
 * formas, pero Apple mira con lupa las apps que solo cargan una web
 * remota: es la causa mas comun de rechazo. Empaquetado, a cambio, cada
 * cambio necesita publicar version.
 *
 * `appId` es tambien el esquema de URL con el que Google devuelve el
 * login a la app (com.hojaldraslily.rewards://auth). Si se cambia aqui, hay
 * que cambiarlo en las URL de redireccion de Supabase.
 */
const config: CapacitorConfig = {
  appId: 'com.hojaldraslily.rewards',
  appName: 'Hojaldras Lily Rewards',
  webDir: 'dist',
  ios: {
    // El fondo detras del contenido mientras carga o al rebotar el scroll.
    backgroundColor: '#1A2E26',
    contentInset: 'never',
  },
  android: {
    backgroundColor: '#1A2E26',
  },
}

export default config
