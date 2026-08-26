# Pendientes

## Auto-sync costosshake → POS (LISTO)

- [x] Trigger `app_data_sync` en la base: cada vez que costosshake guarda,
      vuelca catálogo + precios + recetas a `insumos`/`productos`/`recetas`.
      **NO toca stock** (lo maneja el POS con cada venta). Probado e2e:
      capturar precio a un shake en costosshake lo activa al instante en
      kiosko y POS. Ver `supabase/migrations/auto_sync_app_data_trigger.sql`.
- [x] **Puente de STOCK — modelo "traspaso suma" (LISTO)**: costosshake surte
      (bodega=invOriginal, kiosko=invIndividual) y el POS vende. Se aplican
      DELTAS (no absolutos): `delta = nuevo_en_costosshake − último_aplicado`,
      sumado a `inventario_stock` y registrado en `inventario_movimientos`
      (traspaso=kiosko, ajuste=bodega). El POS sigue restando por venta, así
      que guardar en costosshake NUNCA borra ventas. Estado en
      `costos_stock_sync`. Probado e2e con reversa: surtir 20 → vender 3 → 17;
      re-guardar 25 en costosshake → 22 (no 25, la venta se respeta). Ver
      `supabase/migrations/auto_sync_stock_delta.sql`.
      Nota operativa: en la 1ª corrida siembra el inventario actual como línea
      base (la bodega ya trae valores; el kiosko arranca en 0 hasta que el
      cliente "suba al kiosko" en costosshake).

## Datos (los captura el cliente en costosshake → fluyen solos al POS)

- [ ] Capturar precios de los 17 shakes (hoy sin precio → inactivos en el POS
      y en el autocobro; por eso "faltan los shakes"). Al capturarlos en
      costosshake se activan automáticamente vía el trigger de arriba.
- [ ] Ejecutar `pnpm etl:dry`, conciliar duplicados, `pnpm etl:aplicar`
- [ ] Capturar 106 cantidades de receta (`PENDIENTE-CANTIDAD`)
- [ ] Capturar costos de 38 ingredientes sin costo
- [ ] Validar costeo de 2–3 productos contra el tablero legacy
- [ ] Congelar edición en la app legacy (solo lectura) tras el corte

## Producto / fases

- [x] Fase 5: `apps/pos` + `apps/kiosko` conectadas a datos reales
- [x] Fase 6: KDS ×2 + `cliente-display` sobre `pedidos_cocina` (realtime),
      flujo orden pagada → inventario → cocina verificado e2e
- [x] Fase 7: corte de caja (POS) + `apps/admin` (menú/ventas/inventario)
- [ ] Fase 6 (pulido): sincronizar `ordenes.estado` global cuando todas las
      estaciones terminen; modificador "proteína elegida" que descuente el
      scoop correcto (hoy la proteína se fija en la receta si viene en el JSON)
- [ ] **Vista combinada de cocina (una sola TV)**: pantalla que muestra en un
      mismo monitor los pedidos de alimentos + bebidas, cada tarjeta rotulada
      con su estación (Cocina / Barra), para cuando cocina y barra comparten
      una TV. Hoy son dos apps separadas (`cocina-alimentos` y `cocina-bebidas`);
      es una app/vista nueva sobre `pedidos_cocina` (realtime, misma data).
      Sin construir todavía — planeado.
- [x] **Impresión de comandas automática por estación — LISTO**: cola
      persistente (`trabajos_impresion`) + agente local ESC/POS
      (`agente-impresion/`), reclamo atómico, reintentos con backoff,
      reimpresión auditada, panel en Admin. Ver `docs/impresion-comandas.md`,
      `docs/instalacion-agente-impresion.md`, `docs/configuracion-impresoras.md`.
      Falta que el usuario registre las impresoras reales de cada sucursal en
      Admin e instale el agente en un equipo junto a cada una (checklist en
      `docs/instalacion-agente-impresion.md` §8).
- [ ] Fase 7 (pulido): UI de compras/transferencias/mermas en admin;
      política de cortesías; cancelación post-pago con ajuste automático de
      inventario
- [ ] Fase 8: edge functions `clip-crear-cobro` y `clip-webhook` (cuando haya
      credenciales de Clip; hoy corre en ruta manual con el Stand 2)
- [x] Lealtad "Hojaldras Lily Rewards" núcleo: mancuernas (1 x $10, tope 100),
      cupones a 100 (vigencia 1 año, máx 5), cupón cumpleaños, identificación
      teléfono+QR, canje. Conectado al POS. Ver `docs/flujo-lealtad.md`
- [x] Lealtad: crons con pg_cron (cumpleaños/vencimientos/reactivación),
      PWA del cliente (login Google + QR/saldo/cupones), canje de cupón en el
      cobro (POS y kiosko)
- [x] Promociones personalizadas: segmentación por sabor/día/hora/frecuencia,
      tope 15 días, tipos %/$/producto gratis; CRUD en admin y aplicación en POS
- [ ] Lealtad pendientes: definir valor del cupón de 100 mancuernas si no será
      "ítem gratis"; envío de notificaciones (email/push vía edge function +
      pg_net); promos también aplicables en kiosko (hoy en POS)
- [ ] Balizas de proximidad (beacons BLE): requieren app móvil nativa +
      hardware; fuera del POS web
- [ ] Otras Fase 2 del demo (aplazadas): wallet/monedero, gift cards, delivery,
      RRHH — tablas aditivas cuando el negocio las pida

## Cómo operar hoy (checklist de arranque)

- [ ] Poner la anon key en el `.env` de cada app (`.env.example` incluido)
- [ ] Correr el ETL de costos (`pnpm etl:dry` → conciliar → `pnpm etl:aplicar`)
      para poblar `productos`/`recetas`; sin catálogo el POS/kiosko no tienen
      qué vender
- [ ] Cargar stock inicial en Kiosko (entrada de inventario) para que el
      descuento por venta no deje negativos

## Auditoría de producción (LISTO lo crítico — ver docs/auditoria-produccion.md)

- [x] **Órdenes y cobros atómicos e idempotentes**: `fn_crear_orden`/
      `fn_cobrar_orden` (transaccionales, precio/total recalculado en
      servidor, un solo pago aprobado por orden aunque se reintente).
      Cierra: total/precio manipulable desde el navegador, órdenes fantasma
      por inserts sueltos, pagos duplicados por doble clic.
- [x] **Cierre de acceso directo a `pagos`/`ordenes`/`empleados.pin_hash`**:
      antes cualquiera con la anon key podía aprobar un pago falso o leer
      los hashes de PIN por REST directo (sin pasar por la app). Cerrado
      con RLS + grants de columna. Ver detalle y pruebas en
      `docs/auditoria-produccion.md`.
- [ ] **Decisión de negocio pendiente** (no se tocó sin confirmar): el
      kiosko autoaprueba el pago "terminal" tras una animación de 7s y
      "efectivo" de inmediato, sin que nadie confirme un cobro real —
      viable solo mientras no hay Clip conectado y hay un cajero de
      respaldo. Ver `docs/auditoria-produccion.md` hallazgo C4/M2.

## Seguridad (fase 9 — hardening) ⚠️

- [ ] `app_users` es legible por `anon` (expone hashes) — postura legacy
      heredada, cerrar al retirar el login propio
- [ ] `app_data` escribible por `anon` — cerrar tras congelar el legacy
- [ ] Policies `using (true)` en el resto del catálogo (productos,
      inventario, promociones, etc. — `pagos`/`ordenes`/`empleados` ya se
      cerraron, ver arriba): cualquiera con la anon key puede escribir.
      Sustituir por Supabase Auth + rol en JWT
- [ ] `parametros.clave_traspaso/clave_compras` legibles ("1234"): mover
      validación a RPC y rotar claves
- [ ] `registrarMovimiento` cliente: read-modify-write → RPC atómica
- [ ] Backups: activar PITR o respaldo programado antes de operar en vivo
- [ ] Revisar advisors de Supabase (`get_advisors`) tras cada migración
- [ ] RPCs de empleados (`fn_crear_empleado`/`fn_actualizar_empleado`) están
      `grant`-eados a `anon` (consistente con la postura actual del sistema):
      cualquiera con la anon key podría crear/editar cajeros y sus PIN. Cerrar
      al migrar a Supabase Auth + rol en JWT (validar rol admin en el RPC).
      Los PIN sí van hasheados (pgcrypto) y `pin_hash` nunca se expone.
