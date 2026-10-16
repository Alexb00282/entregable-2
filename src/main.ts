import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Punto de entrada: crea la aplicación Angular con su configuración global.
bootstrapApplication(AppComponent, appConfig)
  // Deja visible en consola cualquier error que impida iniciar la aplicación.
  .catch((err) => console.error(err));
