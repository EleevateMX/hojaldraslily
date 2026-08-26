# Diagnóstico del agente de impresión

Este documento existe por un mandato explícito de esta ronda: **no marcar la
impresión como "validada" solo porque el agente compila o porque el código
se ve correcto.** Aquí se separa, sin adornos, qué se probó de verdad y con
qué método, de qué queda pendiente porque este entorno de desarrollo no
tiene una impresora térmica física conectada.

## El comando `diagnose`

```bash
cd agente-impresion
npm run diagnose                  # todas las impresoras de printers.config.json
npm run diagnose -- <printerId>   # solo una
npm run diagnose -- --imprimir    # además intenta una impresión física real
```

Por cada impresora corre, en orden, y se detiene en el primer fallo que
haga inútil seguir (ej. si Supabase no responde, no tiene caso seguir):

1. **Conexión a Supabase** — llama a `fn_diagnostico_impresora(token)`.
2. **Autenticación (token)** — la misma llamada: 0 filas = token inválido.
3. **Sucursal** / **Estación** — nombre real desde el servidor, no lo que
   diga el archivo local.
4. **Impresora activa en Admin** — si está desactivada, se marca `fail`
   (el agente no podrá reclamar trabajos aunque todo lo demás esté bien).
5. **Config local vs. servidor** — compara `printers.config.json` contra lo
   que Admin tiene guardado (tipo de conexión, ancho de papel, corte
   automático, copias) y avisa si divergen — causa típica de "por qué no
   corta" o "por qué imprime 58mm en una de 80mm".
6. **Latido (escritura autenticada)** — confirma que el token no solo lee,
   también puede escribir (`fn_imprimir_latido`), que es exactamente lo que
   hace el agente real cada ~30s.
7. **Cola de impresión** — cuenta trabajos `pending`/`claimed`/`printing`/
   `retry`/`failed` de esa impresora específica (lectura directa, tabla
   pública de solo lectura).
8. **Conexión física (USB/red)** — `isPrinterConnected()` contra el
   `interface` configurado. Esto SÍ requiere hardware real u otro emulador
   ESC/POS conectado a la máquina donde corre el comando.
9. **Impresión física de prueba** — solo con `--imprimir`: manda una comanda
   de prueba con acentos/eñes y corte automático (si está configurado). Sin
   `--imprimir`, este paso se marca explícitamente como **pendiente de
   hardware**, nunca como "ok".

Al final:
- Se imprime un resumen (`N fallos, M advertencias`) y el proceso sale con
  código `1` si hubo algún fallo (para poder engancharlo a monitoreo).
- Se exporta un archivo de texto a `agente-impresion/logs/diagnostico-<fecha>.txt`
  con el mismo contenido, **sin ningún secreto** (nunca incluye
  `agente_token` ni la anon key) — pensado para mandarlo por WhatsApp/correo
  a soporte sin tener que limpiar nada primero.
- Todo se registra también en `agente-impresion/logs/agente-<fecha>.log`
  (el mismo log rotativo diario que ya usa el agente en producción).

## Qué se validó en esta ronda, y cómo

| Elemento | Método | Resultado |
|---|---|---|
| `fn_diagnostico_impresora` aísla por token (una impresora nunca ve datos de otra) | Prueba SQL en vivo como `anon`, rollback intencional | ✅ Confirmado — token válido devuelve exactamente 1 fila (la suya), token inexistente devuelve 0 |
| El comando detecta config faltante (`.env`/`printers.config.json`) | Ejecución real de `npm run diagnose` sin config | ✅ Falla con mensaje claro, código de salida 1 |
| El comando distingue error de red/RPC de "token inválido" | Ejecución real contra el proyecto Supabase vivo, con una impresora de prueba creada y borrada en la misma sesión | ⚠️ Parcial — el sandbox de desarrollo donde se escribió este código tiene una lista blanca de red que bloquea la salida directa a `*.supabase.co` desde el shell (error "Host not in allowlist"), así que el chequeo #1 no pudo completar un round-trip real aquí. La llamada a `fn_diagnostico_impresora` en sí SÍ se verificó directamente por SQL (fila de arriba). El comando manejó el error de red correctamente (lo reportó como `fail`, exportó el diagnóstico sin secretos, salió con código 1) — el bloqueo fue del sandbox, no del código |
| El archivo exportado nunca contiene el token | Se generó un export real con una impresora de prueba y se hizo `grep` del token sobre el archivo | ✅ Confirmado — cero coincidencias |
| Conexión USB/red a una impresora física | — | ❌ **Pendiente de hardware.** No hay ninguna impresora térmica (ni emulador ESC/POS) conectada al entorno donde se escribió este código. `isPrinterConnected()` y la impresión con `--imprimir` deben correrse en la máquina real de cada sucursal como parte de la instalación (`docs/instalacion-agente-impresion.md`, paso 4 y 8) |
| Que los acentos/eñes salgan legibles en papel térmico real | — | ❌ **Pendiente de hardware**, por la misma razón. El `characterSet` (`PC858_EURO` en `comanda.ts`) es el que mejor cubre impresoras ESC/POS clonadas vendidas en México según la documentación de `node-thermal-printer`, pero solo una impresión física confirma que un modelo específico lo respeta |
| Que el corte automático funcione | — | ❌ **Pendiente de hardware**, misma razón |

## Regla para quien instale esto en una sucursal real

`npm run diagnose -- --imprimir` con TODO en verde (sin ningún ✘) es el
criterio mínimo para considerar una impresora lista para producción — no
"el agente arrancó sin error" ni "compiló". Si algo sale en ⚠, léelo: casi
siempre es una divergencia entre `printers.config.json` y lo que dice Admin,
fácil de corregir antes de que cause un problema real en horario de
servicio.
