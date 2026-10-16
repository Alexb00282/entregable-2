import { Injectable } from '@angular/core';

export type EstadoPedido = 'pendiente' | 'recibido' | 'preparacion' | 'listo';

// Forma mínima de un plato persistido en el carrito y copiado dentro de un pedido.
export interface CarritoItem {
  productoId: number;
  nombre: string;
  categoria: string;
  precio: number;
  cantidad: number;
  fecha: string;
}

// Una orden local mantiene su UUID mientras espera aceptación del servidor.
export interface PedidoGuardado {
  id: string;
  idServidor?: string;
  items: Array<Pick<CarritoItem, 'productoId' | 'nombre' | 'cantidad' | 'precio'>>;
  total: number;
  fecha: string;
  estado: EstadoPedido;
  ultimoError?: string;
}

// Fila única donde se guarda el carrito actual del dispositivo.
interface RegistroCarrito {
  clave: 'actual';
  items: CarritoItem[];
}

// Copia local del menú que permite abrirlo si falla la conexión.
interface RegistroMenu {
  clave: 'menu';
  productos: unknown[];
  actualizado: string;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  // IndexedDB agrupa los datos offline en almacenes separados por tipo.
  private readonly dbName = 'fastOrderDB';
  private readonly dbVersion = 1;
  private readonly cartStore = 'carrito';
  private readonly ordersStore = 'pedidos';
  private readonly menuStore = 'menu';
  private database?: Promise<IDBDatabase>;

  // Inserta/reemplaza y luego lee pedidos; la cola solo devuelve estado pendiente.
  async guardarPedido(pedido: PedidoGuardado): Promise<void> {
    await this.ejecutar<void>(this.ordersStore, 'readwrite', (store) => store.put(pedido));
  }

  async actualizarPedido(pedido: PedidoGuardado): Promise<void> {
    await this.guardarPedido(pedido);
  }

  async obtenerPedidos(): Promise<PedidoGuardado[]> {
    return this.ejecutar<PedidoGuardado[]>(this.ordersStore, 'readonly', (store) => store.getAll());
  }

  async obtenerPedidosPendientes(): Promise<PedidoGuardado[]> {
    return (await this.obtenerPedidos()).filter((pedido) => pedido.estado === 'pendiente');
  }

  // Mantiene el carrito como un único registro fácil de recuperar tras recargar.
  async guardarCarrito(items: CarritoItem[]): Promise<void> {
    await this.ejecutar<void>(this.cartStore, 'readwrite', (store) =>
      store.put({ clave: 'actual', items } satisfies RegistroCarrito));
  }

  async obtenerCarrito(): Promise<CarritoItem[]> {
    const registro = await this.ejecutar<RegistroCarrito | undefined>(
      this.cartStore,
      'readonly',
      (store) => store.get('actual')
    );
    return registro?.items ?? [];
  }

  // Persiste el último menú recibido para abrirlo sin conexión.
  async guardarMenu<T>(productos: T[]): Promise<void> {
    await this.ejecutar<void>(this.menuStore, 'readwrite', (store) =>
      store.put({ clave: 'menu', productos, actualizado: new Date().toISOString() } satisfies RegistroMenu));
  }

  async obtenerMenu<T>(): Promise<T[] | undefined> {
    const registro = await this.ejecutar<RegistroMenu | undefined>(
      this.menuStore,
      'readonly',
      (store) => store.get('menu')
    );
    return registro?.productos as T[] | undefined;
  }

  // Envuelve una petición IndexedDB y propaga errores de petición y transacción.
  private async ejecutar<T>(
    storeName: string,
    mode: IDBTransactionMode,
    requestFactory: (store: IDBObjectStore) => IDBRequest
  ): Promise<T> {
    const db = await this.abrirDB();
    return new Promise<T>((resolve, reject) => {
      // La promesa termina al confirmar la transacción completa, no solo la petición.
      const transaction = db.transaction(storeName, mode);
      const request = requestFactory(transaction.objectStore(storeName));
      let result: T | undefined;
      request.onsuccess = () => {
        result = request.result as T;
      };
      transaction.oncomplete = () => resolve(result as T);
      request.onerror = () => reject(request.error ?? new Error(`Error en almacenamiento: ${storeName}.`));
      transaction.onerror = () => reject(transaction.error ?? new Error(`Falló la transacción: ${storeName}.`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`Se canceló la transacción: ${storeName}.`));
    });
  }

  // Reutiliza la conexión y crea los almacenes cuando la base se abre por primera vez.
  private abrirDB(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
    }
    if (this.database) {
      return this.database;
    }

    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      // Crea cada almacén una sola vez, al crear o subir la versión de la base.
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.cartStore)) {
          db.createObjectStore(this.cartStore, { keyPath: 'clave' });
        }
        if (!db.objectStoreNames.contains(this.ordersStore)) {
          db.createObjectStore(this.ordersStore, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.menuStore)) {
          db.createObjectStore(this.menuStore, { keyPath: 'clave' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.database = undefined;
        reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
      };
      request.onblocked = () => {
        this.database = undefined;
        reject(new Error('La base local está bloqueada por otra pestaña de FastOrder.'));
      };
    });
    return this.database;
  }
}
