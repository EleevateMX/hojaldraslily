# Flujo cocina

## Generación

Al pagarse una orden, `trg_crear_pedidos_cocina` divide los items por
estación:

```
item → producto → categoría → categorias.cocina_id
   (fallback: orden_items.cocina_slug; default: 'bebidas')
```

Resultado: hasta 2 filas en `pedidos_cocina` (una por cocina presente) con
sus `cocina_items`.

## Pantallas (apps/cocina-alimentos, apps/cocina-bebidas)

```ts
const pedidos = await listarPedidosCocina(sb, 'alimentos') // o 'bebidas'
const off = suscribirPedidosCocina(sb, recargar) // realtime ya habilitado
await cambiarEstadoPedido(sb, pedidoId, 'en_preparacion')
```

Estados: `pendiente → en_preparacion → listo → entregado` (+ `cancelado`).

## Cliente display

Escucha los mismos cambios y muestra folios (`ordenes.folio`) agrupados en
"Preparando" (`pendiente`/`en_preparacion`) y "Listo" (`listo`).

## Pendiente (fase 6)

- Sincronizar `ordenes.estado` global cuando TODOS los pedidos de la orden
  estén listos/entregados (trigger adicional o update desde KDS).
- Modificadores/proteína elegida visibles en `personalizacion`.
