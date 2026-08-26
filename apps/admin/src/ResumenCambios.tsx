import type { CambiosCatalogo } from '@shake/supabase'
import { mxn } from '@shake/utils'

/**
 * Lo que va a ver la tienda si se publica ahora.
 *
 * Es la misma lista que enseña Costeos antes de confirmar. Vive aparte
 * porque las dos puertas al mismo acto — Admin y Costeos — tienen que
 * mostrar exactamente lo mismo: si una enseñara menos que la otra, la
 * confianza en las dos se cae.
 */
export function ResumenCambios({ c }: { c: CambiosCatalogo }) {
  if (c.primera_vez) {
    return (
      <p className="text-sm text-sa-green-ink/70 leading-snug">
        Es la primera vez que se publica, así que no hay con qué comparar. Al
        confirmar se guarda la foto del catálogo actual, y de la próxima vez en
        adelante aquí vas a ver exactamente qué cambió.
      </p>
    )
  }

  const grupos: { titulo: string; filas: JSX.Element[] }[] = []
  const añade = (titulo: string, filas: JSX.Element[]) => {
    if (filas.length) grupos.push({ titulo: `${titulo} (${filas.length})`, filas })
  }

  añade('Nuevos', c.altas.map((a, i) => (
    <li key={i}>
      {a.nombre} · <b>{mxn(a.precio)}</b>
      {a.categoria && <span className="text-sa-green-ink/45"> · {a.categoria}</span>}
    </li>
  )))
  añade('Renombrados', c.renombres.map((r, i) => (
    <li key={i}>
      <span className="line-through text-sa-green-ink/45">{r.antes}</span>
      {' → '}<b>{r.ahora}</b>
    </li>
  )))
  añade('Cambios de precio', c.precios.map((p, i) => (
    <li key={i}>
      {p.nombre}: <span className="line-through text-sa-green-ink/45">{mxn(p.antes)}</span>
      {' → '}<b>{mxn(p.ahora)}</b>
    </li>
  )))
  añade('Ya no aparecen', c.bajas.map((b, i) => (
    <li key={i}><span className="line-through text-sa-green-ink/45">{b.nombre}</span></li>
  )))
  añade('Se apagan', c.apagados.map((n, i) => (
    <li key={i}><span className="line-through text-sa-green-ink/45">{n}</span></li>
  )))
  añade('Vuelven a la carta', c.encendidos.map((n, i) => <li key={i}><b>{n}</b></li>))
  añade('Combos que cambiaron', c.combos.map((x, i) => (
    <li key={i}>{x.nombre ?? '(combo)'}: {x.antes ?? '—'} → <b>{x.ahora ?? '—'}</b> piezas</li>
  )))

  if (!grupos.length) {
    return (
      <p className="text-sm text-sa-green-ink/70 leading-snug">
        No hay nada nuevo que mostrar: las pantallas ya tienen lo último que se
        guardó. Publicar de todos modos solo las hace recargar.
      </p>
    )
  }

  return (
    <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1">
      {grupos.map((g) => (
        <div key={g.titulo} className="mb-3 last:mb-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-1">
            {g.titulo}
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-sa-green-ink/85">
            {g.filas}
          </ul>
        </div>
      ))}
    </div>
  )
}
