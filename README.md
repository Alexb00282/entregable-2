# Backus Ventas: caso académico PWA

Aplicación ilustrativa de catálogo para el taller de Runtime Caching. Los nombres, precios, rutas y datos son ficticios; no representan sistemas comerciales reales de Backus.

El workspace usa Angular 19.2.25. El Service Worker integrado de Angular se genera para producción y se registra desde `src/app/app.config.ts`.

## Desarrollo

```powershell
npm start
```

Abre `http://localhost:4200/`. Para compartir el servidor en la red local:

```powershell
npm run start:host
```

En desarrollo, Angular no registra el Service Worker. La prueba offline debe hacerse con el build de producción.

## Runtime Caching

Las reglas están en `ngsw-config.json`:

- `/data/catalogo.json`: `performance`, hasta 20 respuestas durante 1 día.
- `/data/precios.json`: `freshness`, espera la red hasta 3 segundos y conserva hasta 20 respuestas durante 1 hora.
- Imágenes y fuentes locales: `performance`, hasta 60 recursos durante 30 días.
- Los recursos de la aplicación se precargan como app shell.

El catálogo se consume mediante `HttpClient`. Precios y stock se consultan por separado para no tratarlos como contenido estático. Runtime Caching GET no pone en cola pedidos POST; eso requiere una solución adicional con IndexedDB y sincronización.

## Build y prueba offline

```powershell
npm run build
npx http-server ./dist/villa001/browser -p 8080
```

Abre `http://localhost:8080/`, carga el catálogo con conexión y verifica `ngsw-worker.js` en DevTools → Application → Service Workers. Comprueba los recursos en Cache Storage, activa Offline en Network y recarga. El catálogo debería servirse desde caché; precios/stock intentan usar la red y recurren a su respuesta guardada tras el timeout.

El Service Worker requiere HTTPS, excepto en `localhost`. El servidor de desarrollo del CLI no sirve para validar el comportamiento offline de producción.

## Pruebas

```powershell
npm test -- --watch=false --browsers=ChromeHeadless
```
