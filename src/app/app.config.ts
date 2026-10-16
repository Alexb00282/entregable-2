import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Registra rutas y cliente HTTP usados por los servicios de la app.
    provideRouter(routes),
    provideHttpClient(),
    // En desarrollo se desactiva NGSW; producción usa el worker generado por Angular.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() })
  ]
};
