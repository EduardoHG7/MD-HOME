# Impresión de Boletos (CodeREADr)

Aplicación independiente que recibe el resultado de validación de boletos QR
desde **CodeREADr** y manda a imprimir automáticamente el boleto en el punto
correcto, cada uno con su propia impresora.

No depende del resto de MD-HOME: tiene su propio `package.json`, su propia
base de datos (SQLite por defecto) y corre en su propio proceso/puerto.

## Cómo funciona

```
Asistente muestra su QR
        │
        ▼
  App de CodeREADr (celular/lector) valida contra tu lista subida
        │  (solo si es válido)
        ▼
  CodeREADr manda un "Postback" (HTTP) a la URL única de ese punto
        │
        ▼
  Esta app guarda el boleto y lo empuja en tiempo real (SSE)
  a la pantalla del punto correspondiente
        │
        ▼
  La pantalla (abierta en la compu/tablet conectada a la impresora
  de credenciales) dibuja la tarjeta y llama a imprimir automáticamente
```

Cada **punto de impresión** = una compu/tablet con su propia impresora de
tarjetas. La app no manda nada directamente a la impresora: la pantalla del
punto (un navegador en modo kiosko) es la que imprime, usando la impresora
que esa máquina tenga configurada.

## 1. Instalación

```bash
cd apps/impresion-boletos
cp .env.example .env
# Edita .env: pon una ADMIN_PASSWORD y un SESSION_SECRET únicos
npm install
npm run dev
```

Por defecto corre en `http://localhost:3100`.

Para producción (un solo proceso Node persistente, necesario porque usa
Server-Sent Events):

```bash
npm run build
npm run start
```

Debe quedar accesible desde internet en una URL HTTPS (para que CodeREADr le
pueda mandar el postback), por ejemplo detrás de un reverse proxy (Nginx,
Caddy) o un túnel.

## 2. Crear los puntos de impresión

1. Entra a `/admin` con la contraseña de `ADMIN_PASSWORD`.
2. Ve a **Puntos de impresión** → crea uno por cada entrada/mesa (ej.
   "Entrada Principal", "Entrada VIP").
3. Entra al punto recién creado. Ahí tienes dos URLs:
   - **URL del webhook**: la que va a configurar en CodeREADr para ese punto.
   - **URL de la pantalla de impresión**: la que abres en la compu/tablet
     conectada a la impresora de ese punto.
4. Usa el botón **"Enviar boleto de prueba"** para probar que la pantalla
   recibe e imprime correctamente, sin depender todavía de CodeREADr.

## 3. Configurar CodeREADr

CodeREADr permite mandar el resultado de cada escaneo a una URL tuya
("Postback URL" / "Post-Scan Submit"), incluyendo los campos de la lista que
subiste (nombre, apellido, evento, fecha, etc).

Pasos generales (los nombres exactos de los menús pueden variar según tu
plan/versión de CodeREADr — si algo no coincide exactamente, busca la
sección de **Scan Settings → Post-Scan Actions / Submit** dentro de tu
"Scanner Configuration"):

1. En CodeREADr, crea (o edita) la **Scanner Configuration** que usa el
   dispositivo de ese punto para validar contra tu lista de boletos.
2. Dentro de esa configuración, busca la opción de **Postback / Post-Scan
   Submit / Direct Scan to URL** y actívala.
3. Pega ahí la **URL del webhook** de ese punto (la que copiaste en el paso
   anterior). Puede ser GET o POST — esta app acepta ambos.
4. Si CodeREADr te pide elegir qué campos mandar (o un "Export Template"),
   selecciona **todos los campos de la lista** (nombre, apellido, evento,
   fecha, código, etc.) — es más fácil mandar de más y mapear después, que
   tener que volver a esta pantalla si falta un dato.
5. Si tienes varios puntos, repite esto con **una Scanner Configuration por
   punto**, cada una con la URL de su propio punto, y asigna cada
   configuración al dispositivo/usuario que escanea en ese lugar.
6. Haz un escaneo de prueba real desde el celular/lector.

### No necesitas adivinar los nombres exactos de los campos

En vez de depender de que la documentación de CodeREADr coincida exactamente
con tu cuenta, esta app trae una pantalla de **auto-descubrimiento**:

1. Ve a `/admin/mapeo`.
2. Ahí verás el **payload exacto** que llegó del último boleto recibido (de
   prueba o real).
3. Para cada dato (Nombre, Apellido, Evento, Fecha, Código), elige de la
   lista desplegable cuál de esas llaves reales usar.
4. Guarda. De ahí en adelante, cada boleto que llegue se mapea así.

Si no configuras nada, la app intenta adivinar automáticamente probando
nombres comunes (`nombre`, `name`, `field1`, etc.), pero lo más confiable es
mapear a mano una vez viendo el payload real.

## 4. Configurar la impresión automática (sin diálogo de impresión)

La pantalla del punto llama a `window.print()` sola en cuanto llega un
boleto. Para que la tarjeta salga impresa **sin que aparezca el diálogo de
impresión** (y sin que alguien tenga que hacer clic en "Imprimir"), abre
Chrome en esa compu con los flags de kiosko:

```
chrome.exe --kiosk-printing --kiosk "http://TU-DOMINIO/punto/TOKEN-DEL-PUNTO"
```

- `--kiosk-printing` hace que Chrome imprima directo a la impresora
  predeterminada de esa máquina, sin mostrar el diálogo.
- Asegúrate de que la **impresora de tarjetas esté puesta como predeterminada**
  en esa compu (así no hay que elegirla).
- El diseño de la tarjeta (`components/TicketCard.tsx`) está pensado para
  tarjetas tipo CR80 (85.6mm × 54mm, apaisada). Si tu impresora usa otro
  tamaño, ajusta las medidas en ese componente y en el bloque `@page` de
  `app/punto/[token]/page.tsx`.

Dejas esa ventana de Chrome abierta todo el evento; no hace falta tocar
nada más — cada boleto válido se imprime solo.

## 5. Notas de seguridad

- El webhook (`/api/webhook/<token>`) y la pantalla del punto
  (`/punto/<token>`) son públicos a propósito — CodeREADr y el navegador del
  kiosko no pueden mandar la contraseña de admin. Su única protección es que
  el `token` de cada punto es largo y aleatorio; no lo compartas fuera de lo
  necesario.
- El panel `/admin` sí está protegido con `ADMIN_PASSWORD`.
- Si algún día necesitas rotar el token de un punto (por ejemplo si se filtró
  la URL), lo más simple es eliminar el punto y crear uno nuevo con el mismo
  nombre, y reconfigurar esa URL en CodeREADr.

## Variables de entorno

Ver `.env.example`. Con SQLite no hace falta instalar ninguna base de datos
aparte; el archivo se crea solo (`prisma/dev.db`). Para producción con más de
un punto concurrente o más carga, se puede cambiar el `provider` en
`prisma/schema.prisma` a `postgresql` y usar una cadena de conexión real.
