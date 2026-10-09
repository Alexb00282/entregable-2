import { Injectable } from '@angular/core';

export interface PedidoGuardado {
  id?: number;
  producto: string;
  cantidad: number;
  total: number;
  observaciones?: string;
  fecha: string;
  estado: 'pendiente' | 'enviado';
}

export interface MensajeGuardado {
  id?: number;
  texto: string;
  fecha: string;
  estado: 'pendiente' | 'enviado';
}

export interface CarritoItem {
  productoId: number;
  nombre: string;
  categoria: string;
  precio: number;
  cantidad: number;
  fecha: string;
}

export interface VentaGuardada {
  id?: number;
  productoId: number;
  nombre: string;
  categoria: string;
  cantidad: number;
  total: number;
  fecha: string;
  estado: 'confirmada';
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly dbName = 'backusVentasDB';
  private readonly pedidosStore = 'pedidos';
  private readonly mensajesStore = 'mensajes';
  private readonly carritoKey = 'backusVentasCarrito';
  private readonly ventasKey = 'backusVentasHistorial';

  async abrirDB(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(this.pedidosStore)) {
          db.createObjectStore(this.pedidosStore, { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(this.mensajesStore)) {
          db.createObjectStore(this.mensajesStore, { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
    });
  }

  async guardarPedido(pedido: Omit<PedidoGuardado, 'id'>): Promise<void> {
    const db = await this.abrirDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.pedidosStore, 'readwrite');
      const store = transaction.objectStore(this.pedidosStore);
      const request = store.add({ ...pedido });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('No se pudo guardar el pedido.'));
    });
  }

  async guardarMensaje(mensaje: Omit<MensajeGuardado, 'id'>): Promise<void> {
    const db = await this.abrirDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.mensajesStore, 'readwrite');
      const store = transaction.objectStore(this.mensajesStore);
      const request = store.add({ ...mensaje });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('No se pudo guardar el mensaje.'));
    });
  }

  async obtenerPedidos(): Promise<PedidoGuardado[]> {
    if (typeof indexedDB === 'undefined') {
      return [];
    }

    const db = await this.abrirDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.pedidosStore, 'readonly');
      const store = transaction.objectStore(this.pedidosStore);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result as PedidoGuardado[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error('No se pudieron leer los pedidos.'));
    });
  }

  async obtenerMensajes(): Promise<MensajeGuardado[]> {
    if (typeof indexedDB === 'undefined') {
      return [];
    }

    const db = await this.abrirDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.mensajesStore, 'readonly');
      const store = transaction.objectStore(this.mensajesStore);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result as MensajeGuardado[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error('No se pudieron leer los mensajes.'));
    });
  }

  guardarCarrito(items: CarritoItem[]): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.carritoKey, JSON.stringify(items));
    }
  }

  obtenerCarrito(): CarritoItem[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const raw = localStorage.getItem(this.carritoKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as CarritoItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  guardarVentas(ventas: VentaGuardada[]): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.ventasKey, JSON.stringify(ventas));
    }
  }

  obtenerVentas(): VentaGuardada[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const raw = localStorage.getItem(this.ventasKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as VentaGuardada[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
