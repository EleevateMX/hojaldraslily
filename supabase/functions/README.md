# Edge Functions (Deno)

Lo que corre del lado del servidor con secretos que no pueden vivir en el
navegador. Se despliegan con el MCP de Supabase (o `supabase functions
deploy`); **estar en esta carpeta no es estar desplegada** — se comprueba con
`list_edge_functions`, y el 20/10/26 la cuenta era 6 de 8.

| Función | Qué hace | Desplegada (20/10/26) |
|---|---|---|
| `staff-login` | PIN del personal → sesión real de Supabase Auth | sí |
| `clip-crear-cobro` | Inicia un cobro en la terminal Clip (`CLIP_API_KEY`) | **no** |
| `clip-estado-cobro` | Pregunta a Clip el estado real de un intento | sí |
| `clip-cancelar-cobro` | Cancela el intento en la terminal | sí |
| `clip-reembolsar` | Devolución | sí |
| `clip-webhook` | Recibe el timbre de Clip (no viene firmado: solo avisa) | sí |
| `clip-barrer-pendientes` | Barrido cada 2 min de cobros a medias (lo llama el cron 9) | **no** → el cron recibe 404 |
| `interredes-probar` | ¿Contesta la API de Interredes (Banorte) desde aquí? Ver `docs/interredes-manual.md` §0 | sí |

`_shared/` es lo que comparten: `cors.ts`, `clip.ts` y `pinpad.ts` (Clip),
`interredes.ts` (Interredes: la base, el certificado intermedio que el
servidor no manda, y el `login`).

Las dos de Clip sin desplegar no importan mientras no haya terminal Clip
(el kiosko, que era quien cobraba con ella, está apagado); si la casa se
queda con Clip, se despliegan las dos y se ponen sus tres secretos. Ver
`docs/integracion-clip.md`.
