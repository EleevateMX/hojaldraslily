import React, { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { listarProductosParaVenta, type ProductoVenta } from '@shake/supabase'
import { mxn } from '@shake/utils'
import { sb } from './lib/sb'

/** A dónde manda el QR y el botón de lealtad. */
const URL_REWARDS =
  ((import.meta.env.VITE_URL_REWARDS as string | undefined) ?? 'https://rewards.hojaldraslily.com')
    // Si la variable en Cloudflare aún trae la URL vieja, se traduce sola.
    .replace('lily-cliente-pwa.pages.dev', 'rewards.hojaldraslily.com')

const WHATSAPP = 'https://wa.me/529999267151'

/**
 * Categorías del sistema que no pintan en la carta pública: "Extras" vive
 * dentro de cada producto, no como tarjeta propia.
 */
const CATEGORIAS_INTERNAS = /^extras/i

/** Paleta de sabores del manual, para los puntos de la carta. */
const SABORES = ['--c-mint', '--c-banana', '--c-strawberry', '--c-mango', '--c-blueberry', '--c-chocolate']

/** $70 en vez de $70.00 cuando el precio es cerrado, como en la maqueta. */
function precioCorto(n: number): string {
  if (n <= 0) return 'Gratis'
  return Number.isInteger(n) ? `$${n}` : mxn(n)
}

interface CategoriaCarta {
  nombre: string
  orden: number
  cocina: string
  items: ProductoVenta[]
}

export default function App() {
  const [productos, setProductos] = useState<ProductoVenta[]>([])
  const [qr, setQr] = useState('')

  useEffect(() => {
    // La carta se lee de la misma base que usa la caja: lo que el negocio
    // captura en costeo aparece aquí solo, sin publicar nada a mano. Si la
    // consulta falla, la página sigue viéndose — la carta es un plus, no el
    // motivo por el que alguien entra.
    listarProductosParaVenta(sb).then(setProductos).catch(() => setProductos([]))
    QRCode.toDataURL(URL_REWARDS, {
      width: 320, margin: 2, color: { dark: '#14241D', light: '#FFFFFF' },
    }).then(setQr).catch(() => setQr(''))
  }, [])

  const carta = useMemo<CategoriaCarta[]>(() => {
    const m = new Map<string, CategoriaCarta>()
    for (const p of productos) {
      const c = p.categorias
      if (!c || CATEGORIAS_INTERNAS.test(c.nombre)) continue
      let cat = m.get(c.nombre)
      if (!cat) {
        cat = { nombre: c.nombre, orden: c.orden, cocina: c.cocinas?.slug ?? '', items: [] }
        m.set(c.nombre, cat)
      }
      cat.items.push(p)
    }
    return [...m.values()].sort(
      (a, b) => a.cocina.localeCompare(b.cocina) || a.orden - b.orden || a.nombre.localeCompare(b.nombre),
    )
  }, [productos])

  function suscribirse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Sin backend de boletín todavía: el interés llega directo al WhatsApp
    // del negocio, que es donde de todas formas atienden.
    const correo = new FormData(e.currentTarget).get('correo')
    const texto = encodeURIComponent(
      `¡Hola! Quiero mi 10% de descuento en mi primera compra. Mi correo: ${correo ?? ''}`,
    )
    window.open(`${WHATSAPP}?text=${texto}`, '_blank', 'noopener')
  }

  return (
    <>
      {/* ============ NAV ============ */}
      <header className="nav">
        <a className="wordmark" href="#top">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
          Hojaldras Lily
        </a>
        <nav className="links">
          <a href="#menu">Menú</a>
          <a href="#rewards">Rewards</a>
          <a href="#nosotros">Nosotros</a>
          <a href="#b2b">Negocios</a>
          <a href="#contacto">Contacto</a>
          <a className="cta" href={WHATSAPP}>Pedir por WhatsApp</a>
        </nav>
      </header>

      {/* ============ HERO ============ */}
      <section className="hero" id="top">
        <div>
          <p className="eyebrow" style={{ opacity: 0.7 }}>Panadería de hojaldras · Mérida, Yucatán</p>
          <h1>Tradición que <em>vive</em>.</h1>
          <p className="sub">
            Hojaldras recién horneadas con el relleno a la vista, bocadillos,
            pan de temporada y café. Pida su hojaldra para viaje.
          </p>
          <div className="actions">
            <a className="btn light" href="#menu">Ver el menú</a>
            <a
              className="btn ghost"
              style={{ borderColor: 'var(--cream)', color: 'var(--cream)' }}
              href={WHATSAPP}
            >
              WhatsApp
            </a>
          </div>
          <div className="ticker">
            <span>★ Hojaldre dorado</span>
            <span>★ Relleno visible</span>
            <span>★ De Mérida, con tradición</span>
          </div>
        </div>
        <div className="hero-img">
          <div className="badge">Desde<br />$70</div>
          <div className="frame">
            <img className="hojaldra" src={`${import.meta.env.BASE_URL}hojaldra.png`} alt="Hojaldra de Hojaldras Lily" />
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="track">
          <span>Hojaldras ★ Bocadillos ★ Panadería ★ Temporada ★ Bebidas ★ Café ★</span>
          <span>Hojaldras ★ Bocadillos ★ Panadería ★ Temporada ★ Bebidas ★ Café ★</span>
        </div>
      </div>

      {/* ============ MENÚ (vivo, desde la misma base que la caja) ============ */}
      <section className="menu" id="menu">
        <p className="eyebrow">Menú · Price List</p>
        <h2 className="title">Escoge tu hojaldra.</h2>
        <p className="menu-note">Tamaños mini a grande · Precios en MXN</p>

        {carta.length > 0 ? (
          <div className="menu-grid">
            {carta.map((cat) => {
              const desde = Math.min(...cat.items.map((p) => p.precio).filter((n) => n > 0))
              return (
                <div key={cat.nombre} className={cat.nombre === 'Hojaldras' ? 'menu-cat feature' : 'menu-cat'}>
                  <div className="cat-head">
                    <h3>{cat.nombre}</h3>
                    <span className="cat-price">
                      {Number.isFinite(desde) ? `Desde ${precioCorto(desde)}` : 'Pregunta en barra'}
                    </span>
                  </div>
                  {cat.items.map((p, i) => (
                    <div key={p.id} className="mi">
                      <span
                        className="dot"
                        style={{ '--flav': `var(${SABORES[i % SABORES.length]})` } as React.CSSProperties}
                      />
                      <span className="mn">{p.nombre}</span>
                      <span className="mp">{precioCorto(p.precio)}</span>
                      {p.descripcion && <span className="md">{p.descripcion}</span>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="menu-grid">
            <div className="menu-cat">
              <div className="cat-head">
                <h3>Carta del día</h3>
                <span className="cat-price">En barra</span>
              </div>
              <div className="mi">
                <span className="dot" style={{ '--flav': 'var(--c-banana)' } as React.CSSProperties} />
                <span className="mn">Pregunta por el menú de hoy</span>
                <span className="mp">→</span>
                <span className="md">
                  Escríbenos por WhatsApp o visítanos en la Miguel Alemán: hojaldras, pan
                  funcionales y snacks recién hechos.
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ============ REWARDS ============ */}
      <section className="rewards" id="rewards">
        <div>
          <p className="eyebrow">Programa de lealtad</p>
          <h2 className="title">Acumula mancuernas.</h2>
          <p className="lede">
            Escanea el código con la cámara de tu celular, entra con tu cuenta de
            Google y listo. Tu tarjeta vive en el navegador — no hay que instalar
            nada ni cargar un plástico más.
          </p>
          <div className="stats">
            <div className="stat"><b>$10</b><span>1 mancuerna</span></div>
            <div className="stat"><b>100</b><span>Un cupón</span></div>
            <div className="stat"><b>1 año</b><span>Vigencia</span></div>
          </div>
          <p className="fino">¿Sin celular a la mano? En caja te damos de alta con tu teléfono</p>
        </div>
        <div className="qr-card">
          {qr && <img src={qr} alt="Código QR para entrar a Hojaldras Lily Rewards" />}
          <a className="btn" href={URL_REWARDS}>Únete a Rewards</a>
        </div>
      </section>

      {/* ============ NOSOTROS ============ */}
      <section className="about" id="nosotros">
        <div>
          <p className="eyebrow" style={{ opacity: 0.65 }}>Acerca de Hojaldras Lily</p>
          <h2 className="title">Rico, rápido y saludable.</h2>
          <p className="lede">
            Somos una marca orgullosamente mexicana en crecimiento, enfocada en
            bebidas funcionales, nutrición deportiva y bienestar. Te ayudamos a
            comer rico, rápido y saludable con productos de alta calidad.
          </p>
          <div className="vals">
            <div className="val"><span className="starmark" /><span>Sistemas innovadores para la preparación de bebidas proteicas.</span></div>
            <div className="val"><span className="starmark" /><span>Tecnología especializada y proveedores nacionales e internacionales.</span></div>
            <div className="val"><span className="starmark" /><span>Productos innovadores y de alta calidad para el mercado en México.</span></div>
          </div>
        </div>
        <div className="about-img">
          <img className="logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="Logotipo de Hojaldras Lily" />
          <img className="hojaldra" src={`${import.meta.env.BASE_URL}hojaldra.png`} alt="" />
        </div>
      </section>

      {/* ============ GALERÍA ============ */}
      <section className="gallery">
        <p className="eyebrow">Galería</p>
        <h2 className="title">Momentos Hojaldras Lily.</h2>
        <div className="gal-grid">
          {([
            ['Hojaldras', '--green', false],
            ['Jamón y Queso', '--c-banana', true],
            ['Guayaba', '--c-strawberry', false],
            ['Bocadillos', '--c-mango', true],
            ['Pan dulce', '--c-chocolate', false],
            ['Temporada', '--c-blueberry', true],
            ['Café', '--green-deep', false],
            ['Para viaje', '--c-mint', false],
          ] as const).map(([nombre, color, oscuro]) => (
            <div key={nombre}>
              <div
                className={oscuro ? 'gal-tile oscuro' : 'gal-tile'}
                style={{ '--tile': `var(${color})` } as React.CSSProperties}
              >
                <span className="starmark" />
                {nombre}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ NEGOCIOS ============ */}
      <section className="b2b" id="b2b">
        <p className="eyebrow" style={{ opacity: 0.6 }}>Pedidos especiales</p>
        <h2 className="title">¿Un evento, una oficina, una fiesta?</h2>
        <p className="lede">
          Hacemos hojaldras por encargo en tamaños mini, chica, mediana y grande,
          con anticipación de un día. Charolas surtidas de bocadillos, pan de
          temporada y café para llevar a donde se necesite.
        </p>

        <div className="b2b-grid">
          <div className="b2b-card">
            <span className="tag">Por encargo</span>
            <h3>Hojaldra grande · 24 cuadros</h3>
            <p>
              La pieza para compartir: hojaldre dorado, relleno visible y corte en
              cuadros listo para servir. Del sabor que la casa prefiera, dulce o
              salado, con un día de anticipación.
            </p>
            <div className="specs">
              <span>24 cuadros · para 12–16 personas</span>
              <span>Conservación 3 días en refrigeración</span>
            </div>
          </div>
          <div className="b2b-card">
            <span className="tag">Por encargo</span>
            <h3>Charola surtida de bocadillos</h3>
            <p>
              Bocadillos de la vitrina en charola lista para la mesa: dátiles con
              queso, pastelitos de lomo y lo que el horno tenga de temporada.
            </p>
            <div className="specs">
              <span>Desde 20 piezas</span>
              <span>Se arma al gusto</span>
            </div>
          </div>
          <div className="b2b-card">
            <span className="tag">Mayoreo</span>
            <h3>Hojaldras mini para eventos</h3>
            <p>
              Minis individuales del sabor que se pida, empacadas para entregar en
              evento, oficina o desayuno. Precio por volumen a partir de 30 piezas.
            </p>
            <div className="specs">
              <span>Individuales · en bolsa kraft</span>
              <span>Pedido con 48 h de anticipación</span>
            </div>
          </div>
        </div>

        <div className="b2b-cta">
          <a className="btn light" href={WHATSAPP}>Cotizar por WhatsApp</a>
          <a
            className="btn ghost"
            style={{ borderColor: 'var(--cream)', color: 'var(--cream)' }}
            href="mailto:hola@hojaldraslily.com?subject=PEDIDO ESPECIAL HOJALDRAS LILY"
          >
            Cotizar por correo
          </a>
        </div>
      </section>

      {/* ============ BOLETÍN ============ */}
      <section className="subscribe">
        <p className="eyebrow" style={{ opacity: 0.7 }}>Boletín</p>
        <h2>10% de descuento en tu primera compra.</h2>
        <p>Suscríbete a nuestro boletín y recibe promociones, nuevos sabores y noticias Hojaldras Lily.</p>
        <form className="sub-form" onSubmit={suscribirse}>
          <input type="email" name="correo" placeholder="tu@correo.com" required />
          <button type="submit">Inscribirse</button>
        </form>
      </section>

      {/* ============ CONTACTO ============ */}
      <section className="contact" id="contacto">
        <p className="eyebrow">Contacto</p>
        <h2 className="title">Mejor aún: visítanos.</h2>
        <p className="lede">Amamos a nuestros clientes — no dudes en visitarnos en nuestro horario habitual.</p>

        <div className="contact-grid">
          <div className="c-card">
            <h3>Hojaldras Lily Mérida</h3>
            <div className="c-list">
              <div className="c-row"><b>Dirección</b><span>Calle 29-A #183 por Av. 22, Col. Miguel Alemán, Mérida, Yuc., México</span></div>
              <div className="c-row"><b>Teléfono</b><span><a href="tel:+529999267151">+52 999 926 71 51</a></span></div>
              <div className="c-row"><b>WhatsApp</b><span><a href={WHATSAPP}>wa.me/529999267151</a></span></div>
              <div className="c-row"><b>Correo</b><span><a href="mailto:hola@hojaldraslily.com">hola@hojaldraslily.com</a></span></div>
              <div className="c-row"><b>Horario</b><span>Abierto hoy · 6:00 – 10:30 a.m.</span></div>
            </div>
          </div>
          <div className="c-map">
            <iframe
              title="Mapa — Hojaldras Lily en la Col. Miguel Alemán, Mérida"
              src="https://maps.google.com/maps?q=Calle%2029-A%20183%2C%20Miguel%20Alem%C3%A1n%2C%20M%C3%A9rida%2C%20Yucat%C3%A1n&z=16&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <span className="wordmark">Hojaldras Lily</span>
        <div className="social">
          <a href="https://www.facebook.com/hojaldraslily">Facebook</a>
          <a href="https://www.instagram.com/hojaldraslily">Instagram</a>
          <a href="https://www.tiktok.com/@hojaldraslily">TikTok</a>
          <a href={URL_REWARDS}>Rewards</a>
        </div>
        <span className="legal">© 2026 Hojaldras Lily · Mérida, Yucatán</span>
      </footer>
    </>
  )
}
