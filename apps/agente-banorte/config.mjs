// La configuración del agente, leída del `.env`. Vive aparte porque la usan DOS
// procesos: el principal (index.mjs / cola.mjs) y el proceso HIJO de vida corta
// que carga el DLL (pinpad-hijo.mjs). Así el hijo arma el mismo cfg sin que la
// contraseña de Payworks pase por argumentos de línea de comandos — la lee del
// entorno/.env, igual que el padre.

export function cfgDesdeEnv() {
  const falta = []
  const req = (k) => { const v = process.env[k]?.trim(); if (!v) falta.push(k); return v }
  const cfg = {
    dllPath: process.env.DLL_PATH?.trim() || './Pinpad.dll',
    ip: process.env.PINPAD_IP?.trim() || null,
    port: process.env.PINPAD_PORT?.trim() || '1818',
    com: process.env.PINPAD_COM?.trim() || null,
    user: req('PAYWORKS_USER'),
    password: req('PAYWORKS_PASSWORD'),
    // El group es HOTELERO: una panadería no lo necesita (ni en llave ni en
    // venta). Opcional; si algún día se requiere, se pone en el .env.
    group: process.env.PAYWORKS_GROUP?.trim() || '',
    mode: (process.env.PAYWORKS_MODE?.trim() || 'AUT').toUpperCase(),
    getterStyle: (process.env.GETTER_STYLE?.trim() || 'return').toLowerCase(),
    timeout: process.env.TIMEOUT?.trim() || '90',
    puertoHttp: Number(process.env.PUERTO_HTTP?.trim() || '8099'),
  }
  if (!cfg.com && !cfg.ip) falta.push('PINPAD_IP (o PINPAD_COM)')
  if (!['PRD', 'AUT', 'DEC', 'RND'].includes(cfg.mode)) falta.push('PAYWORKS_MODE (PRD|AUT|DEC|RND)')
  if (falta.length) {
    console.error('Faltan datos en .env: ' + falta.join(', '))
    process.exit(1)
  }
  return cfg
}
