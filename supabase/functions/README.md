# Edge Functions (Deno)

Lo que corre del lado del servidor con secretos que no pueden vivir en el
navegador. Se despliegan con el MCP de Supabase (o `supabase functions
deploy`); **estar en esta carpeta no es estar desplegada** — se comprueba con
`list_edge_functions`.

**La terminal es la de Banorte** (Interredes Remotas, vía TPV Solutions; la
casa lo decidió el 20/10/26). Clip no entra: su cron está apagado
(`20261020120000`) y sus funciones se quedan en el repo como referencia
hasta que Banorte quede certificado, sin secretos y sin nadie que las llame.

| Función | Qué hace | Desplegada (20/10/26) |
|---|---|---|
| `staff-login` | PIN del personal → sesión real de Supabase Auth | sí |
| `interredes-probar` | ¿Contesta la API de Banorte desde aquí, y qué secretos faltan para cobrar? (`docs/interredes-manual.md` §0) | sí |
| `interredes-cobrar` | La caja manda el importe a la pinpad y, si se aprueba, la venta entra por `fn_cobrar_orden` / `_mixto` / `fn_encargo_entregar_con_venta`. Solo con sesión del personal | sí |
| `interredes-cancelar` | Cancelación del día (`void`) de un cobro de Banorte. Solo gerencia | sí |
| `interredes-llave` | Carga de llaves de la pinpad (`/transaction/key`); primera operación de la certificación. Solo gerencia | sí |
| `clip-crear-cobro` | Inicia un cobro en la terminal Clip | **no** |
| `clip-estado-cobro` | Pregunta a Clip el estado real de un intento | sí (sin secretos) |
| `clip-cancelar-cobro` | Cancela el intento en la terminal Clip | sí (sin secretos) |
| `clip-reembolsar` | Devolución Clip (`not_implemented`) | sí (sin secretos) |
| `clip-webhook` | Recibe el timbre de Clip | sí (sin secretos) |
| `clip-barrer-pendientes` | Barrido de cobros Clip a medias (su cron ya no existe) | **no** |

`_shared/` es lo que comparten: `cors.ts`; `interredes.ts` (Banorte: la
base, el certificado intermedio que el servidor no manda, el login con su
token, y venta / cancelación / verificación); `clip.ts` y `pinpad.ts` (Clip).

## Los secretos de Banorte

Van en Supabase → Edge Functions → Secrets, **nunca en el repo ni en el chat**:

| Secreto | Qué es | Quién lo da |
|---|---|---|
| `INTERREDES_API_USER` / `INTERREDES_API_PASSWORD` | El `/login` de la API de TPV Solutions | El proveedor / ejecutivo de Banorte |
| `PAYWORKS_USER` / `PAYWORKS_PASSWORD` | Las de Payworks de **solo ejecución**; viajan dentro de cada venta | El correo de alta de Banorte |
| `PINPAD_SERIAL` | Serie de la pinpad como la quiere Payworks («0» + últimos 8 en PAX) | El aparato |
| `PAYWORKS_GROUP` | Grupo/caja de la terminal; va en cada venta y en el cierre | El proveedor |
| `PAYWORKS_MODE` | `AUT` para probar (aprueba sin cobrar), `PRD` para cobrar de verdad. Se exige explícito | Nosotros |

`interredes-probar` dice cuáles faltan (`faltan_para_cobrar`), por nombre y
sin valores. Mientras falte alguno, la caja lo detecta (`no_configurado`) y
cobra la tarjeta a mano, como hasta hoy.
