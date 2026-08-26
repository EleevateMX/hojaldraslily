# Edge functions (fase 8)

Aquí vivirán las funciones server-side (Deno):

- `clip-crear-cobro/` — inicia un cobro en la terminal Clip (usa
  `CLIP_API_KEY` como secret; nunca en frontend).
- `clip-webhook/` — recibe confirmaciones de Clip, valida firma con
  `CLIP_WEBHOOK_SECRET` y aprueba el pago correspondiente.

Ver `docs/integracion-clip.md`.
