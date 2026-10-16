import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';

export interface ActualizacionPush {
  pedidoId?: string;
  estado?: 'recibido' | 'preparacion' | 'listo';
}

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private readonly swPush = inject(SwPush);

  // NGSW solo habilita push en builds con Service Worker registrado.
  get disponible(): boolean {
    return this.swPush.isEnabled;
  }

  get messages$() {
    return this.swPush.messages;
  }

  // Solicita permiso, crea una suscripción Web Push y la registra en el backend.
  async suscribir(): Promise<void> {
    const publicKey = document.querySelector<HTMLMetaElement>('meta[name="vapid-public-key"]')?.content.trim();
    if (!this.swPush.isEnabled) {
      throw new Error('Las notificaciones push requieren el Service Worker activo en producción y HTTPS.');
    }
    if (typeof Notification === 'undefined') {
      throw new Error('Este navegador no ofrece la API de notificaciones.');
    }
    if (!publicKey) {
      throw new Error('Falta configurar la clave pública VAPID en index.html.');
    }
    if (Notification.permission === 'denied') {
      throw new Error('El permiso está bloqueado en el navegador. Habilítalo desde los ajustes del sitio.');
    }
    if (Notification.permission === 'default' && await Notification.requestPermission() !== 'granted') {
      throw new Error('No se concedió permiso para mostrar notificaciones.');
    }

    const subscription = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
    await firstValueFrom(this.http.post<void>('/api/push/subscribe', subscription));
  }

  // Lee el texto de notificación si el payload tiene la forma documentada.
  mensajeDe(payload: object): string {
    if (this.esRegistro(payload) && this.esRegistro(payload['notification'])) {
      const body = payload['notification']['body'];
      if (typeof body === 'string') {
        return body;
      }
    }
    return 'Tienes una actualización de tu pedido.';
  }

  // Extrae de forma segura el ID y el estado opcional enviado por el servidor.
  actualizacionDe(payload: object): ActualizacionPush {
    if (!this.esRegistro(payload) || !this.esRegistro(payload['data'])) {
      return {};
    }
    const data = payload['data'];
    const pedidoId = typeof data['orderId'] === 'string' ? data['orderId'] : undefined;
    const estado = data['status'];
    return {
      pedidoId,
      ...(estado === 'recibido' || estado === 'preparacion' || estado === 'listo' ? { estado } : {})
    };
  }

  // Type guard para inspeccionar objetos JSON sin asumir su forma.
  private esRegistro(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
