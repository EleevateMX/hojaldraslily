/**
 * ETL: app_data (JSON legacy) → insumos / productos / recetas.
 *
 * Modo default: --dry-run (no escribe nada, solo reporte).
 * Modo real:    --aplicar
 *
 * Reglas:
 *  - NUNCA toca app_data ni app_users.
 *  - Idempotente: busca por (nombre, tipo) antes de insertar.
 *  - No corrige datos inconsistentes en silencio: los reporta en
 *    ./reportes/conciliacion.md y ./reportes/conciliacion.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { getSupabaseAdmin } from '@shake/supabase/admin'
import type { LegacyAppData, LegacyReceta, TipoInsumo } from '@shake/types'

const APLICAR = process.argv.includes('--aplicar')

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const limpio = (s: unknown): string => String(s ?? '').trim()

interface InsumoPlan {
  nombre: string
  tipo: TipoInsumo
  unidad: string
  contenido: number
  costo_compra: number
  marca: string | null
  codigo: string | null
  proveedor: string | null
  presentacion: string | null
  precio_individual: number | null
}

interface ProductoPlan {
  nombre: string
  codigo: string | null
  categoria: 'Shakes' | 'Alimentos' | 'Bebidas' | 'Snacks'
  precio: number
  iva_incluido: boolean
  merma_pct: number | null
  es_reventa: boolean
  activo: boolean
  // receta: [nombreInsumo, cantidad, nota]
  receta: { insumo: string; cantidad: number; nota: string | null }[]
}

interface Reporte {
  duplicados: { coleccion: string; nombre: string; accion: string }[]
  sinCosto: { coleccion: string; nombre: string }[]
  sinPrecio: { nombre: string; accion: string }[]
  cantidadesPendientes: { producto: string; insumo: string }[]
  huerfanos: { producto: string; insumo: string }[]
  resumen: Record<string, number>
}

async function main() {
  const sb = getSupabaseAdmin()
  console.log(`Modo: ${APLICAR ? 'APLICAR (escribe en la base)' : 'dry-run (solo reporte)'}`)

  const { data: fila, error } = await sb
    .from('app_data')
    .select('data')
    .eq('id', 'hojaldraslily')
    .single()
  if (error) throw error
  const legacy = fila.data as unknown as LegacyAppData

  const reporte: Reporte = {
    duplicados: [],
    sinCosto: [],
    sinPrecio: [],
    cantidadesPendientes: [],
    huerfanos: [],
    resumen: {},
  }

  // ---------------- plan de insumos ----------------
  const insumos = new Map<string, InsumoPlan>()
  const clave = (nombre: string) => nombre.toLowerCase()

  const agregarInsumo = (plan: InsumoPlan, coleccion: string) => {
    const k = clave(plan.nombre)
    if (!plan.nombre) {
      reporte.duplicados.push({ coleccion, nombre: '(sin nombre)', accion: 'omitido' })
      return
    }
    if (insumos.has(k)) {
      reporte.duplicados.push({ coleccion, nombre: plan.nombre, accion: 'omitido (ya migrada la 1a aparición)' })
      return
    }
    if (plan.costo_compra === 0) reporte.sinCosto.push({ coleccion, nombre: plan.nombre })
    insumos.set(k, plan)
  }

  for (const p of legacy.proteins ?? []) {
    // mismo formato que protKey() del legacy: "MARCA - SABOR"
    const nombre = `${limpio(p.marca)} - ${limpio(p.sabor)}`.replace(/^ - | - $/g, '').trim()
    agregarInsumo(
      {
        nombre,
        tipo: 'proteina',
        unidad: 'scoop',
        contenido: num(p.scoops),
        costo_compra: num(p.costo),
        marca: limpio(p.marca) || null,
        codigo: limpio(p.codigo) || null,
        proveedor: limpio(p.proveedor) || null,
        presentacion: limpio(p.pres) ? `${limpio(p.pres)} g` : null,
        precio_individual: num(p.precioScoop) || null,
      },
      'proteins',
    )
  }

  const mapaIngrediente = (tipo: TipoInsumo, coleccion: 'shakeIngs' | 'foodIngs') => {
    for (const i of legacy[coleccion] ?? []) {
      agregarInsumo(
        {
          nombre: limpio(i.nombre),
          tipo,
          unidad: limpio(i.unidad) || 'g',
          contenido: num(i.cont),
          costo_compra: num(i.costo),
          marca: limpio(i.marca) || null,
          codigo: limpio(i.codigo) || null,
          proveedor: limpio(i.proveedor) || null,
          presentacion: limpio(i.presCompra) || null,
          precio_individual: null,
        },
        coleccion,
      )
    }
  }
  mapaIngrediente('shake', 'shakeIngs')
  mapaIngrediente('alimento', 'foodIngs')

  for (const e of legacy.empaque ?? []) {
    agregarInsumo(
      {
        nombre: limpio(e.nombre),
        tipo: 'empaque',
        unidad: 'pza',
        contenido: 1,
        costo_compra: num(e.costo),
        marca: null,
        codigo: null,
        proveedor: null,
        presentacion: null,
        precio_individual: null,
      },
      'empaque',
    )
  }

  // ---------------- plan de productos ----------------
  const productos: ProductoPlan[] = []

  // bebidas y snacks: insumo reventa + producto 1:1
  const mapaReventa = (coleccion: 'bebidas' | 'snacks', categoria: 'Bebidas' | 'Snacks') => {
    for (const r of legacy[coleccion] ?? []) {
      const nombre = limpio(r.nombre)
      if (!nombre) {
        reporte.duplicados.push({ coleccion, nombre: '(sin nombre)', accion: 'omitido' })
        continue
      }
      const costoUnit = num(r.costo) || (num(r.costoCaja) && num(r.equivPiezas) ? num(r.costoCaja) / num(r.equivPiezas) : 0)
      agregarInsumo(
        {
          nombre,
          tipo: 'reventa',
          unidad: 'pza',
          contenido: 1,
          costo_compra: costoUnit,
          marca: null,
          codigo: limpio(r.codigo) || null,
          proveedor: limpio(r.proveedor) || null,
          presentacion: limpio(r.presOriginal) || null,
          precio_individual: num(r.precio) || null,
        },
        coleccion,
      )
      const precio = num(r.precio)
      if (!precio) reporte.sinPrecio.push({ nombre, accion: 'producto creado inactivo (precio 0)' })
      productos.push({
        nombre,
        codigo: limpio(r.codigo) || null,
        categoria,
        precio,
        iva_incluido: true,
        merma_pct: null,
        es_reventa: true,
        activo: precio > 0,
        receta: [{ insumo: nombre, cantidad: 1, nota: null }],
      })
    }
  }
  mapaReventa('bebidas', 'Bebidas')
  mapaReventa('snacks', 'Snacks')

  // Empaque "combo" del legacy: los empaques marcados shake/food se suman
  // a TODOS los shakes/alimentos. Se reproducen como líneas de receta.
  const empaqueCombo = (flag: 'shake' | 'food') =>
    (legacy.empaque ?? [])
      .filter((e) => e[flag] === true && limpio(e.nombre))
      .map((e) => ({ insumo: limpio(e.nombre), cantidad: 1, nota: 'empaque' }))

  // recetas de shakes y alimentos
  const mapaReceta = (recetas: LegacyReceta[], categoria: 'Shakes' | 'Alimentos') => {
    for (const rec of recetas ?? []) {
      const nombre = limpio(rec.nombre)
      if (!nombre) continue
      const precio = num(rec.precio)
      if (!precio) reporte.sinPrecio.push({ nombre, accion: 'producto creado inactivo (precio 0)' })
      const receta: ProductoPlan['receta'] = []
      for (const ing of rec.ings ?? []) {
        const insumoNombre = limpio(ing[0])
        if (!insumoNombre) continue
        if (!insumos.has(clave(insumoNombre))) {
          reporte.huerfanos.push({ producto: nombre, insumo: insumoNombre })
          continue
        }
        const cantidad = num(ing[1])
        if (!cantidad) reporte.cantidadesPendientes.push({ producto: nombre, insumo: insumoNombre })
        receta.push({
          insumo: insumoNombre,
          cantidad,
          nota: cantidad ? limpio(ing[2]) || null : 'PENDIENTE-CANTIDAD',
        })
      }
      // proteína fija del shake (protKey "MARCA - SABOR") con sus scoops;
      // si viene vacía, la proteína se elige al vender (personalización)
      const proteina = limpio(rec.protein)
      if (proteina) {
        if (insumos.has(clave(proteina))) {
          receta.push({ insumo: proteina, cantidad: num(rec.scoops) || 1, nota: 'proteína' })
        } else {
          reporte.huerfanos.push({ producto: nombre, insumo: proteina })
        }
      }
      receta.push(...empaqueCombo(categoria === 'Shakes' ? 'shake' : 'food'))
      // el legacy acepta merma "8" (=8%) o "0.08"
      const mermaCruda = num(rec.merma)
      productos.push({
        nombre,
        codigo: limpio(rec.codigo) || null,
        categoria,
        precio,
        iva_incluido: rec.ivaIncluido !== false,
        merma_pct: mermaCruda ? (mermaCruda > 1 ? mermaCruda / 100 : mermaCruda) : null,
        es_reventa: false,
        activo: precio > 0,
        receta,
      })
    }
  }
  mapaReceta(legacy.shakeRecipes, 'Shakes')
  mapaReceta(legacy.foodRecipes, 'Alimentos')

  reporte.resumen = {
    insumos_a_migrar: insumos.size,
    productos_a_migrar: productos.length,
    duplicados_omitidos: reporte.duplicados.length,
    insumos_sin_costo: reporte.sinCosto.length,
    productos_sin_precio: reporte.sinPrecio.length,
    lineas_receta_sin_cantidad: reporte.cantidadesPendientes.length,
    insumos_huerfanos: reporte.huerfanos.length,
  }

  // ---------------- escritura (solo con --aplicar) ----------------
  if (APLICAR) {
    // categorías de producto
    const { data: cats, error: catError } = await sb.from('categorias').select('id, nombre')
    if (catError) throw catError
    const catId = new Map(cats.map((c) => [c.nombre, c.id]))

    // insumos: upsert manual por (nombre, tipo)
    const idPorNombre = new Map<string, string>()
    for (const plan of insumos.values()) {
      const { data: existente } = await sb
        .from('insumos')
        .select('id')
        .ilike('nombre', plan.nombre)
        .eq('tipo', plan.tipo)
        .maybeSingle()
      if (existente) {
        await sb
          .from('insumos')
          .update({ contenido: plan.contenido, costo_compra: plan.costo_compra })
          .eq('id', existente.id)
        idPorNombre.set(clave(plan.nombre), existente.id)
      } else {
        const { data: creado, error: insError } = await sb
          .from('insumos')
          .insert(plan)
          .select('id')
          .single()
        if (insError) throw insError
        idPorNombre.set(clave(plan.nombre), creado.id)
      }
    }
    console.log(`✔ insumos migrados: ${idPorNombre.size}`)

    // productos + recetas
    let migrados = 0
    for (const plan of productos) {
      const { data: existente } = await sb
        .from('productos')
        .select('id')
        .ilike('nombre', plan.nombre)
        .maybeSingle()
      let productoId: string
      if (existente) {
        productoId = existente.id
        await sb
          .from('productos')
          .update({ precio: plan.precio, merma_pct: plan.merma_pct })
          .eq('id', productoId)
      } else {
        const { data: creado, error: prodError } = await sb
          .from('productos')
          .insert({
            nombre: plan.nombre,
            codigo: plan.codigo,
            categoria_id: catId.get(plan.categoria) ?? null,
            precio: plan.precio,
            iva_incluido: plan.iva_incluido,
            merma_pct: plan.merma_pct,
            es_reventa: plan.es_reventa,
            activo: plan.activo,
          })
          .select('id')
          .single()
        if (prodError) throw prodError
        productoId = creado.id
      }
      // receta: reemplazo completo (fuente = JSON legacy)
      await sb.from('recetas').delete().eq('producto_id', productoId)
      const lineas = plan.receta
        .map((l) => ({
          producto_id: productoId,
          insumo_id: idPorNombre.get(clave(l.insumo))!,
          cantidad: l.cantidad,
          nota: l.nota,
        }))
        .filter((l) => l.insumo_id)
      if (lineas.length) {
        const { error: recError } = await sb.from('recetas').insert(lineas)
        if (recError) throw recError
      }
      migrados++
    }
    console.log(`✔ productos migrados: ${migrados}`)
  }

  // ---------------- reporte ----------------
  mkdirSync(new URL('./reportes/', import.meta.url), { recursive: true })
  const jsonPath = new URL('./reportes/conciliacion.json', import.meta.url)
  writeFileSync(jsonPath, JSON.stringify(reporte, null, 2))

  const md = [
    `# Reporte de conciliación del ETL`,
    ``,
    `Modo: ${APLICAR ? 'APLICADO' : 'dry-run'}  ·  Fecha: ${new Date().toISOString()}`,
    ``,
    `## Resumen`,
    ...Object.entries(reporte.resumen).map(([k, v]) => `- ${k}: **${v}**`),
    ``,
    `## Duplicados omitidos (conciliar a mano)`,
    ...reporte.duplicados.map((d) => `- [${d.coleccion}] ${d.nombre} — ${d.accion}`),
    ``,
    `## Insumos sin costo (costeo saldrá en $0)`,
    ...reporte.sinCosto.map((d) => `- [${d.coleccion}] ${d.nombre}`),
    ``,
    `## Productos sin precio de venta (creados inactivos)`,
    ...reporte.sinPrecio.map((d) => `- ${d.nombre} — ${d.accion}`),
    ``,
    `## Líneas de receta sin cantidad (nota PENDIENTE-CANTIDAD)`,
    ...reporte.cantidadesPendientes.map((d) => `- ${d.producto} ← ${d.insumo}`),
    ``,
    `## Insumos referenciados que no existen`,
    ...(reporte.huerfanos.length
      ? reporte.huerfanos.map((d) => `- ${d.producto} ← ${d.insumo}`)
      : ['- (ninguno)']),
  ].join('\n')
  writeFileSync(new URL('./reportes/conciliacion.md', import.meta.url), md)

  console.log('\n===== RESUMEN =====')
  console.table(reporte.resumen)
  console.log('Reporte completo: supabase/seed/reportes/conciliacion.md')
  if (!APLICAR) console.log('\nNada se escribió. Ejecuta con --aplicar para migrar de verdad.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
