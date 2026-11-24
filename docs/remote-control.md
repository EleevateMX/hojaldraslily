# Conectar tu computadora con Remote Control

Guía para darle a una sesión de Claude en la nube acceso a una **carpeta de tu
computadora**, y así poder montar/operar Hojaldras Lily en remoto (por ejemplo,
correr el instalador local en la PC de la tienda).

La sesión de la nube **no alcanza tu PC** hasta que tú compartes una carpeta.
Hay dos formas; la segunda es la más confiable.

## Reglas de la carpeta (importante)

La carpeta que compartas **no** puede ser:

- La **raíz de tu usuario** (tu carpeta de inicio).
- Una carpeta **oculta** justo debajo de tu usuario (nombre que empieza con `.`).
- En Mac, nada dentro de `~/Library`.

Usa una carpeta normal y propia, por ejemplo `C:\HojaldrasLily` (Windows) o
`~/HojaldrasLily` (Mac/Linux). Si no existe, créala primero.

## Opción A — Desde la app de Claude (escritorio)

1. **Actualiza la app de Claude** a la última versión (en Windows, hace falta una
   versión reciente para poder servir carpetas; si no, no aparecen).
2. Abre **Ajustes → Claude Code → Remote Control**.
3. **Agrega/comparte** la carpeta de trabajo (una que cumpla las reglas de
   arriba).
4. Deja la app abierta. La carpeta debería aparecer disponible para la sesión
   de la nube.

## Opción B — Desde la terminal (la más confiable)

En la computadora, abre una terminal **dentro de la carpeta** que quieres
compartir y corre:

```
claude remote-control
```

Eso expone **esa** carpeta y la hace visible en la app de Claude Code. Déjalo
corriendo mientras trabajamos. Para dejar de compartir, cierras ese comando.

> En Windows, córrelo en esa carpeta desde PowerShell o la terminal; en
> Mac/Linux, igual, `cd` a la carpeta y luego el comando.

## Cómo sabemos que quedó

Cuando la carpeta esté compartida y la computadora **en línea** (la app de Claude
o `claude remote-control` corriendo), avísame: desde la sesión de la nube veo la
lista de carpetas disponibles y **pido conectarme** a esa. Tú apruebas la
conexión en tu dispositivo, y a partir de ahí puedo correr comandos y ver
archivos **en esa carpeta de tu PC**.

## Qué puedo y qué no una vez conectado

- **Sí:** trabajar dentro de esa carpeta, correr comandos ahí, leer/escribir sus
  archivos. Cada acción fuera de lo rutinario te la confirmo antes.
- **No automático:** cosas de todo el sistema que piden permisos de administrador
  o reinicios (instalar Docker Desktop, habilitar WSL) — esas las haces tú con mi
  guía al lado, porque Windows pide tu visto bueno.

## Seguridad

- Comparte **solo** la carpeta del proyecto, no todo el disco.
- Mientras `claude remote-control` (u la app) esté cerrado, nadie de la nube
  alcanza tu PC.
- Tú apruebas cada conexión, y las acciones que cambian cosas fuera de lo
  rutinario se te confirman.
