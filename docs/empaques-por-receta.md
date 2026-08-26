# Empaques por receta (costosshake)

Cómo funciona el costeo de empaques después de la corrección de
`docs/auditoria-costeo-empaques.md`. Si buscas la causa raíz del error
anterior y los números reales que estaban mal, ese documento es la
referencia — este es el manual de cómo se usa el sistema ya corregido.

## Qué cambió

**Antes:** el catálogo de Empaque tenía dos checkboxes por artículo
("shake" / "alimento"). Marcar un empaque como "shake" lo sumaba
automáticamente al costo de **todos** los shakes que existieran. Por eso
un shake de 16oz cargaba también el vaso de 20oz, la tapa boquilla, el
popote — todo lo que estuviera marcado, sin importar si ese shake en
particular lo usaba.

**Ahora:** el catálogo de Empaque (pestaña "Empaque") solo guarda
información del artículo — clave, marca, proveedor, **presentación de
compra**, costo, existencias. Ya no decide a qué productos afecta.

Cada shake y cada alimento tiene su propia sección **"Empaques"**, debajo
de "Ingredientes", en su tarjeta de costeo (pestañas "Costeo Shakes" /
"Costeo Alimentos"). Ahí se agregan, uno por uno, los empaques que ese
producto específico usa, con su cantidad — exactamente igual a como ya
funcionan los ingredientes.

## Cómo asignar los empaques correctos a un producto

1. Ve a **Costeo Shakes** (o **Costeo Alimentos**).
2. Busca la tarjeta del producto. Si tiene algún empaque pendiente de
   asignar, vas a ver un aviso amarillo arriba de la lista con el detalle
   de lo que ese producto sumaba automáticamente antes de la corrección
   (útil para saber qué buscar: si antes sumaba "Vaso 16 oz, Tapa domo,
   Popote...", ese shake probablemente usa uno de esos, no todos).
3. En la sección "Empaques" de la tarjeta, toca **"+ empaque"**.
4. Elige el empaque exacto (ej. "Vaso 16 oz"), captura la cantidad (casi
   siempre 1), y listo — el subtotal se calcula solo con el costo vigente
   del catálogo.
5. Repite para cada empaque que ese producto realmente use (vaso, tapa,
   popote, fajilla, servilleta, etc.). Un shake puede tener 0, 1, 2 o más
   — no hay límite ni mínimo.

**Dos shakes distintos pueden (y normalmente deben) tener empaques
distintos.** Un shake de 20oz debe llevar el vaso de 20oz, no el de 16oz.
Eso ya no se puede confundir porque cada uno se configura por separado.

## Presentación del empaque

El catálogo de Empaque ahora tiene una columna **Presentación** (ej. "Caja
x 1,000 piezas", "Paquete x 100 piezas"). Es solo informativa — te ayuda a
saber en qué presentación se compra ese empaque, para cuando registres una
entrada de mercancía — **no sustituye la cantidad real capturada** en cada
entrada ni en cada receta.

## Qué se sincroniza al POS/Kiosko

`supabase/seed/sync-app-data.sql` ahora lee el arreglo `empaques` de cada
receta (en vez de los checkboxes que ya no existen) y crea, para cada
producto, líneas de `recetas` apuntando a sus insumos tipo `empaque` — el
mismo mecanismo que ya usan los ingredientes. La vista real
`vw_costeo_producto` (que usa Admin/POS) ya sumaba correctamente el costo
de empaque por producto desde antes — solo le faltaban datos reales, que
ahora sí puede recibir.

**Este sync no se ha corrido todavía** contra los datos reales — hace
falta que primero se asignen los empaques correctos a cada shake/alimento
en costosshake (siguiendo el paso a paso de arriba), y después correr
`sync-app-data.sql` para reflejarlo en el esquema real. No tiene sentido
sincronizar antes, porque hoy ningún shake/alimento tiene todavía su
arreglo `empaques` lleno (todos empiezan vacíos tras la corrección, a
propósito — ver §5 de la auditoría: nunca se reasignan empaques de forma
automática/silenciosa).

## Migración de los datos anteriores

Los checkboxes `shake`/`food` que existían antes **no se borraron** de los
empaques ya capturados — quedaron ahí, sin uso, únicamente como referencia
para que el aviso amarillo de cada tarjeta de receta pueda decirte qué
solía sumarse automáticamente. No se leen para ningún cálculo. Se pueden
limpiar más adelante sin ningún efecto, una vez que todos los productos
tengan sus empaques reales asignados.
