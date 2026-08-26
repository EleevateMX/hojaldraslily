# Instalación del agente local de impresión

Guía paso a paso para poner a imprimir comandas automáticamente en una
sucursal nueva o una estación nueva. El agente vive en `agente-impresion/`
del repo — es un servicio Node/TS aparte, **no** se despliega a Cloudflare
(corre en un mini-PC local, junto a la impresora).

## 1. Requisitos

- Un equipo (mini-PC, laptop vieja, lo que haya) **en la misma red** que
  la impresora, prendido todo el horario de operación.
- Node.js 20+ instalado en ese equipo.
- La impresora térmica ESC/POS (USB o de red) ya conectada y con IP fija
  si es de red (revisa el menú de la impresora o imprime su página de
  configuración — normalmente hay un botón de auto-test).

## 2. Registrar la impresora en Admin

1. Entra a Admin → **Impresoras** → "Nueva impresora".
2. Nombre libre (ej. "Impresora Cocina"), estación (Cocina o Barra),
   tipo de conexión:
   - **Red**: IP + puerto (casi siempre `9100`).
   - **USB**: nombre/ruta del dispositivo (ver paso 4).
3. Ancho de papel, copias, corte automático, buzzer — como se necesite.
4. Al guardar, Admin muestra el **token del agente una sola vez**.
   Cópialo ya — lo vas a pegar en `printers.config.json` del paso 3.
   (Si lo pierdes, no pasa nada: crea la impresora de nuevo o pide que se
   rote el token — no queda expuesto después en la lista).

## 3. Instalar el agente en el equipo de la estación

```bash
cd agente-impresion
npm install
cp .env.example .env
cp printers.config.example.json printers.config.json
```

Edita `.env`:
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`: los mismos valores públicos que
  usan las apps (ya vienen de ejemplo con los reales del proyecto).
- `AGENTE_ID`: un nombre que identifique este equipo (ej.
  `agente-cocina-01`) — aparece en los logs y en `claimed_by`.

Edita `printers.config.json` (puede tener **más de una impresora** si un
mismo equipo controla, por ejemplo, Cocina y Barra a la vez):

```json
[
  {
    "id": "cocina-01",
    "descripcion": "Impresora térmica de Cocina",
    "token": "PEGA-AQUI-EL-TOKEN-DEL-PASO-2",
    "interface": "tcp://192.168.1.50:9100",
    "anchoPapel": "80mm",
    "copias": 1,
    "corteAutomatico": true,
    "buzzer": false
  }
]
```

`interface`:
- Red: `tcp://IP:PUERTO`
- USB en Linux: la ruta del dispositivo, ej. `/dev/usb/lp0`
- USB en Windows: `printer:NombreCompartidoDeLaImpresora` (comparte la
  impresora desde Windows con ese nombre primero)

## 4. Probar la impresora ANTES de conectar todo lo demás

```bash
npm run test-print -- cocina-01
```

(cambia `cocina-01` por el `id` que pusiste en `printers.config.json`).
Esto imprime una comanda de prueba **sin tocar Supabase** — solo prueba
que el agente le puede hablar a la impresora. Si no sale nada:

- Red: revisa que la IP responda (`ping 192.168.1.50`), que el puerto sea
  el correcto, que no haya firewall bloqueando.
- USB: revisa el nombre/ruta del dispositivo, permisos (en Linux puede
  requerir estar en el grupo `lp` o correr con permisos).
- Si sale pero con acentos/eñes rotos: ver `docs/configuracion-impresoras.md`
  (es cuestión de ajustar `characterSet` en `src/comanda.ts` para tu
  modelo de impresora).

Después (o en vez) de `test-print`, corre el diagnóstico completo — revisa
conexión a Supabase, que el token sea válido, que la sucursal/estación
coincidan con Admin, y el estado de la cola, además de la impresora física:

```bash
npm run diagnose                    # todas las impresoras de printers.config.json
npm run diagnose -- cocina-01       # solo esa
npm run diagnose -- --imprimir      # además imprime una prueba física (acentos + corte)
```

Ver `docs/diagnostico-impresion.md` para qué significa cada resultado y qué
tan lejos llega cada chequeo sin hardware real.

## 5. Arrancar el agente de verdad

```bash
npm run start
```

Deja la consola abierta un momento y confirma en los logs que dice
`Realtime: SUBSCRIBED` y que el latido se manda cada ~30s sin error. Haz
una venta de prueba en el POS/kiosko con un producto de esa estación —
debe imprimirse la comanda sola, sin tocar nada más.

Revisa el estado en cualquier momento en `http://localhost:7777/status`
(puerto configurable en `.env`), o en Admin → Impresoras (columna
"Conectada", se pone verde cuando el latido es reciente).

## 6. Dejarlo arrancando solo con el equipo

**Windows (recomendado — Programador de tareas, sin dependencias extra):**
1. Compila una vez: `npm run build` (genera `dist/index.js`).
2. Abre "Programador de tareas" → Crear tarea básica.
3. Desencadenador: "Al iniciar sesión" (o "Al iniciar el equipo" si el
   mini-PC no tiene usuario que inicie sesión solo).
4. Acción: iniciar un programa → `node.exe`, argumentos
   `C:\ruta\a\agente-impresion\dist\index.js`, "Iniciar en"
   `C:\ruta\a\agente-impresion`.
5. En Configuración, marca "Reiniciar la tarea si falla" cada 1 minuto.

**Windows (alternativa — Servicio de Windows real, arranca antes de
iniciar sesión):**
```bash
npm install node-windows
npm run build
npm run install-windows-service
```
Requiere permisos de administrador. Ver `src/installWindowsService.ts`.

**Linux — systemd** (ejemplo, ajusta rutas y usuario):
```ini
# /etc/systemd/system/hojaldraslily-impresion.service
[Unit]
Description=Hojaldras Lily - agente de impresión
After=network-online.target

[Service]
WorkingDirectory=/home/pos/agente-impresion
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
User=pos

[Install]
WantedBy=multi-user.target
```
```bash
npm run build
sudo systemctl enable --now hojaldraslily-impresion
```

## 7. Interfaz gráfica (tray icon) — no incluida en esta versión

Se evaluó Electron para una interfaz de bandeja del sistema y se decidió
**no construirla todavía**: el endpoint local `/status` + los logs en
`agente-impresion/logs/` ya cubren "ver que está conectado" sin el costo
de mantener una app de escritorio completa. Si a futuro hace falta algo
más visual (para que cualquier empleado, no solo quien instaló el
agente, pueda ver el estado sin abrir una URL), es un paso natural sobre
el mismo `/status` — documentado como mejora futura, no como algo ya
hecho.

## 8. Checklist rápido para una sucursal nueva

- [ ] Impresora física conectada y con IP fija (si es de red)
- [ ] Impresora registrada en Admin → Impresoras, token copiado
- [ ] `agente-impresion` instalado en un equipo de esa sucursal
- [ ] `printers.config.json` con el token correcto por impresora
- [ ] `npm run test-print` sale bien (hardware ok)
- [ ] `npm run diagnose -- --imprimir` sin fallos (conexión + auth + sucursal/estación + cola + hardware)
- [ ] `npm run start` conecta (Realtime SUBSCRIBED, latido sin error)
- [ ] Venta de prueba real imprime la comanda sola
- [ ] Agente configurado para arrancar solo con el equipo
