# FastOrder S.A. — PWA de pedidos

Prototipo académico mobile-first para consultar el menú, conservar el carrito offline y encolar pedidos pendientes. Usa Angular 19 y el Service Worker oficial de Angular. El menú de `public/data/catalogo.json` es de demostración.

## Arranque y prueba PWA

```powershell
npm ci
npm start
```

Abre `http://localhost:4200`. El servidor de desarrollo permite trabajar en la interfaz, pero no registra el Service Worker. Para probar instalación y uso offline:

```powershell
npm run build
npx http-server ./dist/villa001/browser -p 8080
```

Abre `http://localhost:8080`, espera a que el worker se active y visita el menú. En DevTools → Application confirma `ngsw-worker.js`, Cache Storage y el manifest. Activa Network → Offline y recarga. El menú ya visitado y el carrito deben permanecer disponibles. Los Service Workers requieren HTTPS, excepto en `localhost`.

## Implementación

- **Menú y búsqueda:** tarjetas de platos, filtro de texto y pestañas de categorías desplazables horizontalmente.
- **Carrito:** botón flotante y panel lateral; se guarda en IndexedDB, junto con los pedidos pendientes.
- **Offline-first:** al confirmar, el pedido se guarda primero en IndexedDB con UUID/idempotency key. Se intenta enviar de inmediato si hay conexión. Al recuperar Internet o al abrir de nuevo la app se reintenta; si la pestaña está cerrada, no se promete sincronización inmediata.
- **Estados:** el servidor es la autoridad. La app consulta cada 15 segundos mientras está abierta y también aplica eventos push. Los estados visuales son Recibido → En preparación → Listo.
- **Instalación:** el banner usa `beforeinstallprompt`; solo aparece cuando el navegador permite instalar.
- **Notificaciones:** la suscripción usa `SwPush`, permiso del navegador, una clave pública VAPID y el endpoint de registro del backend.

## Cómo leer el código y las configuraciones

Los archivos de código fuente tienen comentarios de sección en español. Los archivos JSON y `manifest.webmanifest` se mantienen sin comentarios porque JSON no admite comentarios y el navegador, Angular CLI y TypeScript esperan JSON válido. Este mapa explica qué hace cada configuración:

| Archivo | Qué configura |
| --- | --- |
| `package.json` | Scripts npm (`start`, `build`, `test`) y dependencias Angular/RxJS. |
| `angular.json` | Entradas del build, archivos estáticos, estilos, presupuestos, Service Worker de producción, servidor local y Karma. |
| `tsconfig.json` | Opciones TypeScript compartidas: compilación estricta, destino ES2022 y reglas estrictas del compilador Angular. |
| `tsconfig.app.json` | Archivo de entrada de la aplicación y tipos del navegador. |
| `tsconfig.spec.json` | Archivos de pruebas y tipos Jasmine. |
| `ngsw-config.json` | App shell precargado, recursos estáticos y grupos de caché runtime. |
| `public/manifest.webmanifest` | Nombre de la PWA, URL inicial/scope, vista standalone, tema y propósitos de iconos. |
| `public/data/catalogo.json` | Platos ficticios con ID, categoría, precio de demostración, stock visual, descripción y emoji. |
| `public/data/precios.json` | Datos de ejemplo heredados de la plantilla anterior; el menú FastOrder actual no los solicita. |
| `.vscode/launch.json` | Configuraciones para iniciar `ng serve` y depurar pruebas en Chrome. |
| `.vscode/tasks.json` | Tareas npm de desarrollo y tests detectables por VS Code. |
| `.vscode/extensions.json` | Extensión Angular recomendada para VS Code. |

Los SVG admiten comentarios XML y explican la diferencia entre el icono normal y el maskable. El informe HTML también tiene comentarios de sus secciones de contenido y estilos.

### Estrategias de caché

`ngsw-config.json` configura el shell y las peticiones GET:

- **Menú:** Angular Service Worker usa `freshness` (prioriza red, hasta 3 segundos, y recurre a una respuesta guardada). `CatalogoService` añade un patrón stale-while-revalidate en la capa de aplicación: emite primero el menú guardado en IndexedDB y acto seguido revalida desde la red para actualizar la vista y la copia local.
- **Pedidos/estado:** `freshness` (Network-First) para GET `/api/orders/**`, con timeout de 3 s y retención breve.
- **Mutaciones:** Angular Service Worker no guarda ni pone en cola peticiones POST. La cola de `POST /api/orders` vive en IndexedDB y solo se elimina de la cola lógica cuando el servidor devuelve una confirmación.

Angular NGSW ofrece las estrategias `performance` y `freshness`, pero no configura literalmente una estrategia `stale-while-revalidate`; el comportamiento SWR del menú está implementado expresamente en `CatalogoService`. No se almacenan respuestas de confirmación POST en Cache Storage.

### Contrato necesario del backend

Este workspace contiene el frontend, no la API. Sin backend, los pedidos seguirán visibles como pendientes y el botón de push explicará qué configuración falta. Implementa los siguientes endpoints detrás de HTTPS:

```http
POST /api/orders
Idempotency-Key: <UUID creado por el cliente>
Content-Type: application/json

{
  "clientOrderId": "UUID",
  "items": [{ "productoId": 1, "nombre": "Hamburguesa clásica", "cantidad": 2, "precio": 18.9 }],
  "total": 37.8,
  "createdAt": "2026-10-16T15:00:00.000Z"
}
```

Respuesta `201` (o respuesta idempotente equivalente):

```json
{ "id": "orden-servidor-123", "estado": "recibido" }
```

`GET /api/orders/{id}` debe devolver `{ "id": "orden-servidor-123", "estado": "preparacion" }`, con estado `recibido`, `preparacion` o `listo`. El servidor debe validar precios, disponibilidad y cantidades; aplicar la clave de idempotencia dentro de una transacción para no duplicar pedidos en reintentos; autenticar/autorizarlos según el caso, y devolver errores explícitos. No confíes en el precio ni el total enviado por el navegador.

## Push: configuración real y prueba

1. Genera un par de claves VAPID en el backend. La **clave pública** no es secreta; colócala en el contenido de `<meta name="vapid-public-key">` de `src/index.html`. Guarda la clave privada solo como secreto del servidor.
2. Implementa `POST /api/push/subscribe` para validar y asociar la suscripción Web Push con el usuario/dispositivo. Protege el endpoint y almacena la suscripción de forma segura.
3. Desde el servidor, al cambiar el estado de un pedido, envía un push firmado a esa suscripción. El payload esperado es:

   ```json
   {
     "notification": { "title": "FastOrder", "body": "Tu pedido está en preparación." },
     "data": { "orderId": "orden-servidor-123", "status": "preparacion" }
   }
   ```

4. Ejecuta un build de producción en HTTPS, instala/abre la PWA y pulsa **Activar avisos de pedidos**. Acepta el permiso y comprueba el registro en el backend.
5. Simula un cambio de estado desde el backend y verifica la notificación, el mensaje en pantalla y el avance del rastreador. Para desarrollo local, el servidor puede emitir el mismo payload con una herramienta de prueba; llamar a `Notification` en la página no equivale a un push real.

Push real requiere backend, VAPID, HTTPS, permiso y suscripción. El frontend no incluye claves, servidor de pedidos ni servicio emisor.

## Respuestas técnicas para el informe

### 1. ¿Qué ventajas ofrece una PWA frente a una aplicación nativa?

Una PWA distribuye una experiencia instalable mediante tecnologías web y una URL, sin exigir el ciclo de publicación de una tienda para cada actualización. Puede compartir código entre plataformas, reducir fricción de acceso y, con un Service Worker, conservar la interfaz y datos seleccionados cuando la red falla. Una aplicación nativa puede ofrecer integración más amplia y uniforme con el sistema operativo y APIs del dispositivo. La instalación, las notificaciones, el almacenamiento y las capacidades offline de una PWA dependen del navegador y de la plataforma; por ello no son equivalentes en todos los dispositivos.

### 2. ¿Por qué elegir distintas estrategias de caché?

El menú es contenido consultado con frecuencia y tolera una versión reciente aunque la red no esté disponible. FastOrder muestra primero la copia IndexedDB y actualiza desde la red para acortar la espera (SWR a nivel de servicio). El estado de un pedido cambia con rapidez, por lo que las lecturas priorizan la red y usan una respuesta caché solo como respaldo breve. La escritura del pedido es una operación transaccional: no debe fingir éxito con una respuesta cacheada; se guarda en IndexedDB hasta que el backend confirme la operación. Los cambios de estado y el stock requieren validación en servidor.

### 3. ¿Cómo se abordó el diseño responsivo?

La interfaz parte de una columna y controles táctiles adecuados a pantallas pequeñas. Las tarjetas se distribuyen en tres columnas, dos en tablet y una en móvil; las categorías usan desplazamiento horizontal, el buscador filtra de inmediato y el carrito se presenta en un panel accesible desde un botón fijo. La composición emplea CSS Grid/Flexbox, tamaños fluidos y `prefers-reduced-motion`. Debe comprobarse también con teclado, lector de pantalla, texto ampliado y emulación de dispositivos reales.

### 4. ¿Cómo se gestiona el modo offline?

El Service Worker precarga el app shell y conserva recursos/datos GET según las reglas declaradas. El carrito y los pedidos se escriben en IndexedDB, que sobrevive a una recarga. Cada pedido lleva un UUID estable y se envía con `Idempotency-Key`; la app reintenta al recibir `online` o al arrancar. El UUID solo evita duplicados si el servidor implementa idempotencia. Esta alternativa no garantiza ejecución con la aplicación cerrada: Background Sync no se ha conectado a Angular NGSW en este prototipo. La interfaz distingue el pedido guardado localmente del pedido confirmado por el restaurante.

### 5. ¿Qué límites tiene la demostración?

El catálogo y precios son datos de muestra. Para cerrar el flujo se necesita desplegar el contrato de API anterior, implementar autenticación, inventario/precios autoritativos, idempotencia, almacenamiento de suscripciones push y envío VAPID. El rastreador consulta cambios mediante polling cada 15 segundos como respaldo; Push entrega actualizaciones oportunistas cuando el navegador lo permite. Ningún almacenamiento local sustituye la validación del servidor ni debe considerarse respaldo permanente de datos críticos.

## Archivos clave

- `src/app/app.component.*`: menú, filtros, carrito, instalación, rastreador y avisos.
- `src/app/services/storage.service.ts`: IndexedDB para menú, carrito y cola de pedidos.
- `src/app/services/catalogo.service.ts`: carga inicial y revalidación del menú.
- `src/app/services/order-sync.service.ts`: contratos HTTP de pedidos y estado.
- `src/app/services/push.service.ts`: suscripción y recepción de eventos Web Push.
- `ngsw-config.json`: caché de app shell, menú y lecturas de pedidos.
- `public/manifest.webmanifest` y `public/icons/`: instalación, tema e iconos adaptativos.

## Pruebas

```powershell
npm test -- --watch=false --browsers=ChromeHeadless
```
