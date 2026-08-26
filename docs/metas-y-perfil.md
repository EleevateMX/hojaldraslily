# Metas, logros y la cara del cliente

Dos cosas que llegaron juntas porque resuelven el mismo problema: que la app
se sienta de uno y que dé motivos para volver a abrirla.

---

## 1. La foto

Google ya manda la foto en el token, así que la tarjeta deja de verse
anónima **sin que el cliente suba nada**: se toma sola al entrar y se
refresca en cada login.

Si sube la suya, esa manda. `clientes.foto_propia` existe justo para eso:
sin esa bandera, el siguiente login de Google le pisaría su elección y
parecería un bug. Desde *Cuenta → Tu foto* puede volver a la de Google.

Cuando no hay foto —cuenta sin imagen, o la subida falló— se pintan sus
iniciales sobre el verde de la marca. Un icono gris de "persona sin foto"
se ve roto; las iniciales se ven intencionales.

**Dónde vive.** Bucket `avatares`, carpeta `<auth.uid()>/`. Las políticas
exigen ese prefijo: sin él, cualquier cliente con sesión podría sobrescribir
la foto de otro.

**Qué URL se acepta.** Solo las de nuestro propio almacenamiento
(`fn_guardar_mi_foto` lo verifica). Si se aceptara cualquiera, la foto de
perfil sería un hueco por donde meter la dirección de un servidor ajeno que
se carga cada vez que alguien abre su tarjeta.

---

## 2. Metas

El programa de lealtad solo premia comprar, y comprar cuesta. Las metas
premian lo que vale mucho para el negocio y cuesta centavos:

| Meta | Da | Cuesta | Se repite |
|---|---:|---:|---|
| Pasa a saludar (abrir la app) | 1 | $0.10 | cada día |
| Deja tu teléfono | 25 | $2.50 | una vez |
| Reseña en Google + captura | 100 | $10 | una vez |
| Historia de Instagram + captura | 50 | $5 | cada 7 días |

Abrir la app todos los días del año cuesta **$36.50** en producto. Una
reseña de Google cuesta $10 — bastante menos que traer a ese cliente por
publicidad.

### Dos clases, y la diferencia importa

**Automáticas.** El servidor comprueba el hecho: que hoy no se haya
cobrado, que el teléfono esté guardado. Se acredita sola. Si dependiera de
lo que dice el cliente, la meta sería un botón de regalarse mancuernas.

**De evidencia.** El cliente manda la captura y **gerencia aprueba** desde
Admin → Metas. Sin ese candado, una reseña de 100 mancuernas la cobra
cualquiera subiendo una imagen del rollo.

### El saludo diario no tiene botón

Se cobra solo al abrir la app. Pedirle a alguien que toque un botón para
recibir 1 mancuerna es hacerle trabajo por diez centavos.

### Los candados

| Riesgo | Qué lo impide |
|---|---|
| Cobrar la diaria dos veces | Índice único por `(cliente, meta, día)` — dos toques seguidos no acreditan dos veces |
| Declarar un hecho falso | La condición se comprueba en el servidor, no se recibe del cliente |
| Cobrar una reseña con cualquier imagen | Solo acredita cuando gerencia aprueba |
| Mandar diez capturas de la misma meta | Una pendiente por meta y por cliente |
| Subir una captura desde una URL ajena | Solo se acepta el bucket `evidencias` |
| Dar puntos sin dejar rastro | Todo pasa por `mancuernas_movimientos`, como cualquier otra mancuerna |

Nadie escribe en `misiones_cumplidas` a mano: RLS solo deja **leer**. Un
insert directo daría puntos sin dejar movimiento, y el saldo dejaría de
poder reconstruirse.

### Cambiar el catálogo

Las metas viven en la tabla `misiones` y gerencia puede editarlas (RLS lo
permite con `fn_es_jefe()`). Para agregar una nueva de evidencia basta un
`insert`; la app la pinta sola. Una nueva **automática** sí necesita código:
su condición se comprueba dentro de `fn_meta_automatica`, que es
precisamente donde tiene que estar.

```sql
-- Ejemplo: subir la reseña a 150 mancuernas
update misiones set mancuernas = 150 where clave = 'resena_google';

-- Apagar una sin borrar su historia
update misiones set activo = false where clave = 'historia_instagram';
```

---

## 3. Probado de punta a punta

Contra producción, en transacciones abortadas:

- Saludo del día → +1; segundo intento el mismo día → rechazado.
- Perfil sin teléfono → rechazado; con teléfono → +25; repetido → rechazado.
- Captura con URL ajena → rechazada.
- Segundo envío con uno pendiente → rechazado.
- Aparece en la bandeja de gerencia; al aprobar, +100 en el momento.
- Saldo: 0 → 26 → 126, cada paso con su movimiento.
