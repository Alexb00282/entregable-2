import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PedidoGuardado } from './storage.service';

export type EstadoServidorPedido = 'recibido' | 'preparacion' | 'listo';

export interface RespuestaPedido {
  id: string;
  estado: EstadoServidorPedido;
}

@Injectable({ providedIn: 'root' })
export class OrderSyncService {
  private readonly http = inject(HttpClient);

  // Envía el pedido y reusa siempre su UUID para hacer seguro el reintento.
  enviar(pedido: PedidoGuardado): Promise<RespuestaPedido> {
    return firstValueFrom(this.http.post<RespuestaPedido>(
      '/api/orders',
      {
        clientOrderId: pedido.id,
        items: pedido.items,
        total: pedido.total,
        createdAt: pedido.fecha
      },
      { headers: { 'Idempotency-Key': pedido.id } }
    ));
  }

  // Lee el estado autoritativo actual; el identificador va codificado en la URL.
  consultarEstado(id: string): Promise<RespuestaPedido> {
    return firstValueFrom(this.http.get<RespuestaPedido>(`/api/orders/${encodeURIComponent(id)}`));
  }
}
