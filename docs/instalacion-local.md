# Instalación en local (servidor en la tienda) + Tailscale

Este documento es el **plan** para sacar Hojaldras Lily de la nube y correrlo
en un **servidor local en la tienda**, con **Tailscale** como la vía por la que
Nuvora entra a actualizar y a dar soporte en remoto. Es para revisarlo antes de
mover nada: ningún paso de aquí está hecho todavía.

La meta son dos cosas que la casa pidió:

1. **Menos superficie de hackeo** — los datos se quedan en la tienda, nada
   expuesto a internet público, y se baja la vitrina (el demo con los PIN a la
   vista).
2. **Que Nuvora pueda actualizar el programa siempre** — sin ir a la tienda,
   entrando por Tailscale a ese mismo servidor.

Lo honesto de entrada: esto es viable y es buena jugada, pero **cambia quién se
hace cargo de qué**. En la nube, Supabase hacía respaldos, parches y el acceso
remoto solos. En local eso pasa a ser de Nuvora. Este plan es justamente para
que ese traspaso sea ordenado y no una sorpresa.

---

## 1. Qué se mueve a local y qué NO

**Se mueve a la tienda (corre sin internet):**

- **El backend entero (Supabase es auto-hospedable, es open source):** la base
  Postgres, el login del personal (Auth/GoTrue), las APIs (PostgREST), Realtime
  (las pantallas en vivo), Storage y las Edge Functions (Deno). Las **237
  migraciones** se aplican igual contra la base local.
- **Las 9 apps** (caja, admin, producción, horno, empaque, pantallas, web,
  costos): son archivos estáticos; se sirven desde el mismo servidor en la red
  local (LAN).
- **Los agentes de la PC** (impresión de comandas, agente de caja/tickets,
  agente de Banorte): ya corren en la tienda; solo se les cambia a qué servidor
  apuntan.

**NO se puede mover — sigue necesitando internet (son servicios de terceros):**

- **Facturación (ContaDigital/Isyconta):** timbra en el SAT, es en la nube.
- **Cobro con tarjeta (Banorte / TPV Solutions):** la pinpad y la API del banco
  viven afuera.
- **Rappi**, cuando entre su API.

Esto está bien pensado ya: el **núcleo del POS** (vender, inventario, cortes,
encargos, impresión) funciona **100% en la LAN aunque se caiga internet**, y el
modo **sin-internet** (`docs/sin-internet.md`) cubre el momento del cobro.
Facturar y cobrar con tarjeta esperan a que vuelva internet, como hoy.

---

## 2. La forma del montaje

```
   ┌─────────────────────── Tienda (LAN) ───────────────────────┐
   │                                                            │
   │   Servidor local (mini-PC con Docker)                      │
   │   ├─ Supabase self-hosted (Postgres, Auth, API, Realtime,  │
   │   │  Storage, Edge Functions)  ← las 237 migraciones       │
   │   ├─ Servidor web (nginx/Caddy) sirviendo las 9 apps       │
   │   └─ Tailscale  ──────────────────────────┐                │
   │                                           │                │
   │   PC de la caja ── agente-impresion       │                │
   │                 ── agente-caja (tickets)  │   internet     │
   │                 ── agente-banorte (DLL)   │   (solo para   │
   │   Pantallas (producción, horno, empaque)  │    tarjeta y   │
   │                                           │    facturar)   │
   └───────────────────────────────────────────┼────────────────┘
                                               │
                         Tailnet de Nuvora  ◄──┘
                         (actualizar, Admin remoto, soporte)
```

- **Dentro de la tienda:** todo habla por la red local, sin salir a internet.
- **Internet** solo lo usan la tarjeta (Banorte) y la facturación (ContaDigital).
- **Tailscale** es el único canal de afuera hacia adentro, y es cifrado y
  privado (no es un puerto abierto a todo el mundo).

---

## 3. Hardware del servidor

Un mini-PC dedicado, encendido 24/7, que NO es la caja:

- **CPU/RAM:** algo tipo Intel N100 / i3 con **16 GB RAM** (Supabase + Postgres
  cómodos). 8 GB es el mínimo; 16 da aire.
- **Disco:** SSD de **256–512 GB** (la base es chica, pero los respaldos y
  Storage suman).
- **No-break (UPS):** obligatorio. Un corte de luz a media escritura corrompe
  Postgres; el UPS da para apagar bien.
- **Red:** por **cable** al router, con **IP fija** en la LAN (p. ej.
  `192.168.1.10`).
- **Segundo disco o USB** para los respaldos (no en el mismo disco que la base).

Es la misma clase de equipo que el de `docs/hardware.md`, pero dedicado a
servidor; no se usa como pantalla.

---

## 4. Red y Tailscale (el canal de Nuvora)

**En la LAN:**

- El servidor con IP fija. Las apps y los agentes le apuntan por esa IP (o por
  un nombre local tipo `lily.local` si se monta un DNS chico).
- Nada de abrir puertos en el router hacia internet. **Cero** reenvío de
  puertos. Todo lo de afuera entra por Tailscale.

**Tailscale (lo que pediste):**

- Se instala Tailscale en el **servidor de la tienda** y se une al **tailnet de
  Nuvora**. Queda con una dirección estable del tailnet (p. ej.
  `100.x.y.z`, y con MagicDNS un nombre tipo `lily-tienda`).
- **Para actualizar:** desde cualquier máquina de Nuvora que esté en el tailnet,
  se entra por **Tailscale SSH** al servidor y se corre el script de
  actualización (ver §7). No hace falta ir a la tienda ni abrir nada al público.
- **Admin desde el teléfono (tuyo o de la dueña):** se instala la app de
  Tailscale en el celular, se une al tailnet, y se abre Admin en la dirección
  del servidor (`http://lily-tienda/admin` por el tailnet). Así sigues entrando
  a Admin desde fuera de la tienda, pero **solo quien está en el tailnet** —no
  el internet entero—.
- **ACLs del tailnet:** se limita por reglas quién llega a qué. P. ej. los
  equipos de Nuvora llegan al servidor; la dueña solo a Admin. Tailscale lo
  hace con su archivo de ACL.
- Opcional: **Tailscale Funnel** NO se usa (eso volvería a exponer a internet);
  la gracia es justo lo contrario.

---

## 5. Instalación del servidor, paso a paso

Esto es el guion; los comandos exactos se afinan en el piloto (§11).

1. **Sistema base:** el mini-PC con Linux (Debian/Ubuntu Server), Docker y
   Docker Compose.
2. **Supabase self-hosted:** se clona el `docker-compose` oficial de
   auto-hospedaje de Supabase y se configura su `.env` (contraseña de Postgres,
   **nuevo `JWT_SECRET`**, URLs). Esto levanta Postgres, Auth, API, Realtime,
   Storage y el runtime de Edge Functions.
3. **Llaves nuevas:** al tener `JWT_SECRET` propio, se generan las llaves
   **anon** y **service_role** locales. ⚠️ **Ojo (trampa conocida, CLAUDE.md
   §4):** el JWT trae el proyecto codificado adentro; las llaves de la nube
   **no sirven** en local y al revés. Se usan SIEMPRE las nuevas.
4. **Extensiones:** habilitar **pg_net** y **pg_cron** en la base local (la
   replicación no copia extensiones — fue justo lo que mordió en la nube). Las
   usa el cron y las llamadas a Edge Functions desde la base.
5. **Migraciones:** aplicar las **237** de `supabase/migrations/` contra la base
   local (con `supabase db push` apuntando al Postgres local, o corriéndolas en
   orden). Al terminar: el conteo de archivos tiene que cuadrar con las filas de
   `schema_migrations`, como dice CLAUDE.md.
6. **Datos de configuración:** las migraciones crean la estructura, no los datos.
   Se trae de la nube un volcado (`pg_dump`) de **solo lo de configuración**:
   catálogo, insumos, empleados, impresoras con su token, cajas, parámetros
   (incluido `parametros.ticket` con el logo), categorías, Costeos. **No** se
   trae lo transaccional si se quiere arrancar en cero, o **sí** si se quiere
   continuar la historia (se decide en la migración, §10).
7. **Edge Functions:** desplegar en el stack local las que importan
   (`supabase/functions/README.md` dice cuáles): `staff-login`, las
   `interredes-*`, las `contadigital-*`. Corren en Deno dentro del contenedor de
   funciones.
8. **Secretos de las funciones:** cargar en el entorno local los secretos de
   ContaDigital y Banorte (los mismos que irían en la nube). **Nunca** en el
   repo; van en el `.env` del servidor, protegido.
9. **Servir las apps:** compilar las 9 apps **apuntando al Supabase local**
   (§6) y servirlas con nginx/Caddy en la LAN, cada una en su ruta
   (`/caja`, `/admin`, `/produccion`, …). Caddy además da **HTTPS local** con un
   certificado propio, que conviene para que las PWAs y el login se porten bien.
10. **Agentes:** repuntar `agente-impresion`, `agente-caja` y `agente-banorte`
    al servidor local (su URL de Supabase y su llave publicable nueva). El token
    de cada impresora/terminal se vuelve a generar desde Admin → Impresoras.

---

## 6. Cómo apuntan las apps al servidor local

Detalle importante del código (para que no sorprenda):

- Las apps leen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` **en tiempo de
  compilación** (Vite los incrusta en el bundle; ver
  `packages/supabase/src/client.ts`). **No son configuración en vivo.**
- Por eso, apuntar las apps al Supabase local = **recompilarlas** con un `.env`
  que tenga la URL local (p. ej. `http://lily-tienda:8000` o
  `https://lily.tienda.local`) y la **anon key local**.
- El mapa `DOMINIO_PROPIO` de `client.ts` (hoy vacío) era para el add-on de
  dominio propio de Supabase en la nube; en local **no se usa**: se pone la URL
  local directa en el `.env`.
- Consecuencia práctica: **cada actualización del programa implica recompilar**
  las apps en el servidor y copiarlas al web root. Eso es justo lo que
  automatiza el script de §7.

---

## 7. Actualizar el programa por Tailscale (el flujo de Nuvora)

La idea que pediste, hecha rutina. Desde una máquina de Nuvora en el tailnet:

1. `tailscale ssh lily-tienda` — entras al servidor.
2. Corres el **script de actualización** (lo dejo listo cuando montemos el
   piloto). Hace, en orden:
   - `git pull` del repo (o baja un paquete versionado).
   - **Compila** las 9 apps con el `.env` local y copia el resultado al web root
     (nginx/Caddy las sirve ya actualizadas).
   - Aplica **migraciones nuevas** a la base local (`supabase db push`).
   - **Redespliega las Edge Functions** que cambiaron.
   - Reinicia lo que haga falta (sin tocar la base de datos).
3. Las pantallas de la tienda toman la versión nueva al recargar (el service
   worker ya maneja eso; CLAUDE.md §4 "frontend").

El **agente de caja ya se auto-actualiza** (CLAUDE.md §2.11), pero hoy lo hace
desde `main` en GitHub. En el montaje local se le cambia la fuente al servidor
de la tienda, para que también se actualice por la LAN sin depender de GitHub.

Ventaja de todo esto: actualizas **cuando quieras, desde donde estés**, por un
canal cifrado y privado, sin que la tienda tenga un solo puerto abierto al
público.

---

## 8. Respaldos (lo que antes hacía la nube)

En local esto es de Nuvora, y es lo más importante de no olvidar:

- **Respaldo automático diario** de la base con `pg_dump`, a un **segundo disco**
  del servidor y, mejor, también a un lugar fuera de la tienda (un disco que
  rote, o un bucket cifrado al que se suba por Tailscale/internet de noche).
- **Rotación** (p. ej. 7 diarios + 4 semanales), para no llenar el disco.
- **Prueba de restauración** cada cierto tiempo: un respaldo que nunca se probó
  no es un respaldo. Se restaura en un equipo aparte y se verifica que levanta.
- El **logo, los parámetros del ticket y los tokens** viven en la base, así que
  el `pg_dump` ya los cubre.

---

## 9. Seguridad del montaje local

- **Nada expuesto a internet:** cero reenvío de puertos en el router. Lo de
  afuera entra solo por Tailscale.
- **Firewall en el servidor:** solo abre a la LAN los puertos de las apps y la
  API; lo demás, cerrado.
- **Bajar la vitrina** (GitHub Pages) o al menos la caja/Admin del demo, y
  **cambiar los PIN** de demostración — es lo que ya estaba pendiente y lo que
  explicaba los folios saltados de madrugada.
- **Llaves y secretos** solo en el `.env` del servidor, con permisos cerrados;
  nunca en el repo (el repo es público).
- **Tailscale con ACLs**: cada quién llega solo a lo suyo.
- La seguridad de verdad del sistema ya vive en **RLS y las funciones**
  (CLAUDE.md §5); local no la cambia, solo le quita la exposición pública.

---

## 10. Pasar de la nube a local sin perder datos

Cuando se decida el cambio:

1. Montar el servidor local y dejarlo **funcionando en paralelo** con una copia
   de la nube (migraciones + `pg_dump` de configuración).
2. Elegir el punto de corte: **arrancar en cero** (como ya se hizo el 19 y 27
   de octubre) o **traer la historia** (volcado completo). Para abrir limpio, lo
   normal es cero: configuración sí, transaccional no.
3. **Día del cambio:** repuntar las apps y los agentes al servidor local,
   verificar una venta de punta a punta (crear, cobrar, comanda, ticket, corte),
   y recién entonces apagar lo de la nube.
4. Dejar la nube **pausada, no borrada**, unas semanas como red de seguridad.

---

## 11. Lo que falta validar en un piloto (honesto)

No todo se puede dar por hecho desde aquí; un piloto de 1–2 días en un equipo de
prueba confirma:

- Que las **Edge Functions** (staff-login, interredes, contadigital) corren bien
  en el stack auto-hospedado (es lo más distinto a la nube administrada).
- Que **Realtime** y **Auth** (el login por PIN) se portan igual en local.
- Que **pg_net + pg_cron** quedan habilitados y el cron corre.
- Que las apps compiladas contra el Supabase local **arrancan** (y no caen en el
  bug del `.env` que vacía el bundle, CLAUDE.md §4 "frontend").
- Que el **HTTPS local** (Caddy) deja contentas a las PWAs y al login.
- Que el **script de actualización por Tailscale** hace el ciclo completo.

---

## 12. Checklist

- [ ] Mini-PC servidor + UPS + IP fija en la LAN
- [ ] Docker + Supabase self-hosted levantado, con `JWT_SECRET` propio
- [ ] Llaves anon/service_role **locales** generadas
- [ ] pg_net + pg_cron habilitados
- [ ] 237 migraciones aplicadas (conteo cuadra con `schema_migrations`)
- [ ] `pg_dump` de configuración importado (catálogo, empleados, impresoras,
      parámetros con logo)
- [ ] Edge Functions desplegadas + secretos cargados en el `.env` del servidor
- [ ] 9 apps compiladas contra el Supabase local y servidas por Caddy (HTTPS)
- [ ] Agentes (impresión, caja, Banorte) repuntados y con tokens nuevos
- [ ] Tailscale en el servidor, unido al tailnet de Nuvora, con ACLs
- [ ] Admin accesible por Tailscale desde el teléfono
- [ ] Script de actualización por Tailscale SSH probado de punta a punta
- [ ] Respaldo diario automático + rotación + **prueba de restauración**
- [ ] Vitrina bajada y PIN de demo cambiados
- [ ] Venta de punta a punta verificada antes de apagar la nube

---

**Resumen en una línea:** sí se puede, y encaja con tu meta — todo corre en la
tienda sin exposición pública, y Nuvora entra por **Tailscale** a actualizar y
dar soporte; a cambio, Nuvora asume respaldos, actualizaciones y el acceso
remoto, y facturación y tarjeta siguen necesitando internet.
