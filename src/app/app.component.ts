import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, timer } from 'rxjs';
import { CatalogoService, Producto } from './services/catalogo.service';
import { OrderSyncService } from './services/order-sync.service';
import { CarritoItem, EstadoPedido, PedidoGuardado, StorageService } from './services/storage.service';
import { PushService } from './services/push.service';

// El navegador aún no tipa este evento en todas las versiones de TypeScript.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  // Datos de presentación que consume la plantilla.
  readonly title = 'FastOrder';
  readonly pasosPedido = [
    { estado: 'recibido' as const, etiqueta: 'Recibido' },
    { estado: 'preparacion' as const, etiqueta: 'En preparación' },
    { estado: 'listo' as const, etiqueta: 'Listo' }
  ];
  private readonly catalogoService = inject(CatalogoService);
  private readonly orderSyncService = inject(OrderSyncService);
  private readonly storageService = inject(StorageService);
  private readonly pushService = inject(PushService);
  // Una sola suscripción agrupa los listeners RxJS para liberarlos al cerrar la vista.
  private readonly subscriptions = new Subscription();
  private installPrompt?: BeforeInstallPromptEvent;

  // Estado visible: datos, filtros, carrito, sincronización e instalación.
  productos: Producto[] = [];
  pedidos: PedidoGuardado[] = [];
  cartItems: CarritoItem[] = [];
  terminoBusqueda = '';
  categoriaSeleccionada = 'Todos';
  enLinea = typeof navigator === 'undefined' || navigator.onLine;
  cargandoCatalogo = true;
  errorCatalogo = '';
  mensaje = '';
  cartOpen = false;
  sincronizando = false;
  instalable = false;
  pushDisponible = false;
  activandoAvisos = false;

  ngOnInit(): void {
    // Carga inicial local/remota y escucha errores de revalidación del menú.
    this.cargarCatalogo();
    void this.cargarPersistencia();
    this.subscriptions.add(this.catalogoService.revalidationErrors$.subscribe((error) => {
      this.mensaje = `Mostrando el menú guardado; no se pudo actualizar: ${this.errorComoTexto(error)}`;
    }));
    // Mientras la vista esté abierta, consulta al servidor los pedidos activos.
    this.subscriptions.add(timer(0, 15000).subscribe(() => void this.actualizarEstadosPedidos()));
    if (this.enLinea) {
      void this.sincronizarPedidos();
    }
    this.pushDisponible = this.pushService.disponible;
    if (this.pushDisponible) {
      this.subscriptions.add(this.pushService.messages$.subscribe((payload) => {
        this.mensaje = this.pushService.mensajeDe(payload);
        void this.aplicarActualizacionPush(payload);
      }));
    }
  }

  ngOnDestroy(): void {
    // Evita dejar el polling y el listener de push vivos tras destruir el componente.
    this.subscriptions.unsubscribe();
  }

  // El navegador dispara estos eventos al cambiar conectividad de la pestaña.
  @HostListener('window:online')
  alConectar(): void {
    this.enLinea = true;
    void this.sincronizarPedidos();
    void this.actualizarEstadosPedidos();
  }

  @HostListener('window:offline')
  alDesconectar(): void {
    this.enLinea = false;
  }

  // Guarda la invitación nativa de instalación hasta que la persona pulsa el botón.
  @HostListener('window:beforeinstallprompt', ['$event'])
  alSolicitarInstalacion(event: BeforeInstallPromptEvent): void {
    event.preventDefault();
    this.installPrompt = event;
    this.instalable = true;
  }

  @HostListener('window:appinstalled')
  alInstalar(): void {
    this.instalable = false;
    this.installPrompt = undefined;
    this.mensaje = 'FastOrder se instaló correctamente.';
  }

  // Valores derivados: no se duplican como estado mutable.
  get categorias(): string[] {
    return ['Todos', ...new Set(this.productos.map((producto) => producto.categoria))];
  }

  get productosFiltrados(): Producto[] {
    const termino = this.terminoBusqueda.trim().toLocaleLowerCase('es');
    return this.productos.filter((producto) =>
      (this.categoriaSeleccionada === 'Todos' || producto.categoria === this.categoriaSeleccionada)
      && `${producto.nombre} ${producto.descripcion}`.toLocaleLowerCase('es').includes(termino)
    );
  }

  get totalCarrito(): number {
    return this.cartItems.reduce((total, item) => total + item.cantidad * item.precio, 0);
  }

  get unidadesCarrito(): number {
    return this.cartItems.reduce((total, item) => total + item.cantidad, 0);
  }

  // Actualiza la categoría activa; el getter vuelve a filtrar los platos.
  seleccionarCategoria(categoria: string): void {
    this.categoriaSeleccionada = categoria;
  }

  // Añadir un plato actualiza el carrito persistido y da feedback inmediato.
  agregarAlCarrito(producto: Producto): void {
    const existente = this.cartItems.find((item) => item.productoId === producto.id);
    if (existente) {
      existente.cantidad += 1;
    } else {
      this.cartItems = [...this.cartItems, {
        productoId: producto.id,
        nombre: producto.nombre,
        categoria: producto.categoria,
        precio: producto.precio,
        cantidad: 1,
        fecha: new Date().toISOString()
      }];
    }
    void this.guardarCarrito();
    this.mensaje = `${producto.nombre} se agregó al carrito.`;
  }

  // Ajusta la cantidad y elimina una línea cuando llega a cero.
  cambiarCantidad(productoId: number, incremento: number): void {
    const item = this.cartItems.find((actual) => actual.productoId === productoId);
    if (!item) {
      return;
    }
    item.cantidad += incremento;
    this.cartItems = this.cartItems.filter((actual) => actual.cantidad > 0);
    void this.guardarCarrito();
  }

  // Primero persiste localmente; solo después intenta enviar para no perder pedidos offline.
  async confirmarPedido(): Promise<void> {
    if (this.cartItems.length === 0) {
      this.mensaje = 'Agrega al menos un plato antes de confirmar el pedido.';
      return;
    }

    const pedido: PedidoGuardado = {
      id: crypto.randomUUID(),
      items: this.cartItems.map(({ productoId, nombre, cantidad, precio }) => ({ productoId, nombre, cantidad, precio })),
      total: Number(this.totalCarrito.toFixed(2)),
      fecha: new Date().toISOString(),
      estado: 'pendiente'
    };

    try {
      await this.storageService.guardarPedido(pedido);
      this.cartItems = [];
      await this.storageService.guardarCarrito(this.cartItems);
      this.cartOpen = false;
      await this.cargarPersistencia();
      this.mensaje = this.enLinea
        ? 'Pedido guardado. Intentando enviarlo al restaurante…'
        : 'Pedido guardado en este dispositivo. Se enviará al recuperar la conexión.';
      if (this.enLinea) {
        await this.sincronizarPedidos();
      }
    } catch (error) {
      this.mensaje = `No se pudo guardar el pedido: ${this.errorComoTexto(error)}`;
    }
  }

  // El evento de instalación solo puede invocarse tras una acción del usuario.
  async instalarApp(): Promise<void> {
    if (!this.installPrompt) {
      return;
    }
    try {
      await this.installPrompt.prompt();
      const choice = await this.installPrompt.userChoice;
      this.instalable = false;
      this.installPrompt = undefined;
      if (choice.outcome === 'accepted') {
        this.mensaje = 'FastOrder se instaló correctamente.';
      }
    } catch (error) {
      this.mensaje = `No se pudo iniciar la instalación: ${this.errorComoTexto(error)}`;
    }
  }

  // Inicia suscripción push solo al pulsar el botón y comunica el resultado.
  async activarAvisos(): Promise<void> {
    this.activandoAvisos = true;
    try {
      await this.pushService.suscribir();
      this.mensaje = 'Avisos activados para este dispositivo.';
    } catch (error) {
      this.mensaje = `No se pudieron activar los avisos: ${this.errorComoTexto(error)}`;
    } finally {
      this.activandoAvisos = false;
    }
  }

  // Convierte el estado del backend a texto legible y mantiene los pasos monotónicos.
  estadoLabel(estado: EstadoPedido): string {
    const labels: Record<EstadoPedido, string> = {
      pendiente: 'Pendiente de envío',
      recibido: 'Recibido',
      preparacion: 'En preparación',
      listo: 'Listo'
    };
    return labels[estado];
  }

  pasoActivo(estado: EstadoPedido, paso: 'recibido' | 'preparacion' | 'listo'): boolean {
    const orden: Exclude<EstadoPedido, 'pendiente'>[] = ['recibido', 'preparacion', 'listo'];
    return estado !== 'pendiente' && orden.indexOf(estado) >= orden.indexOf(paso);
  }

  private cargarCatalogo(): void {
    this.cargandoCatalogo = true;
    this.errorCatalogo = '';
    this.subscriptions.add(this.catalogoService.obtenerCatalogo().subscribe({
      next: (productos) => {
        this.productos = productos;
        this.cargandoCatalogo = false;
      },
      error: (error: unknown) => {
        this.errorCatalogo = this.errorComoTexto(error);
        this.cargandoCatalogo = false;
      }
    }));
  }

  // Restaura en paralelo la cola de pedidos y el carrito guardado en IndexedDB.
  private async cargarPersistencia(): Promise<void> {
    try {
      const [pedidos, carrito] = await Promise.all([
        this.storageService.obtenerPedidos(),
        this.storageService.obtenerCarrito()
      ]);
      this.pedidos = pedidos.sort((a, b) => b.fecha.localeCompare(a.fecha));
      this.cartItems = carrito;
    } catch (error) {
      this.mensaje = `No se pudo abrir el almacenamiento local: ${this.errorComoTexto(error)}`;
    }
  }

  private async guardarCarrito(): Promise<void> {
    try {
      await this.storageService.guardarCarrito(this.cartItems);
    } catch (error) {
      this.mensaje = `No se pudo guardar el carrito: ${this.errorComoTexto(error)}`;
    }
  }

  // Reintenta pedidos pendientes en orden; la clave idempotente evita duplicados en el backend.
  private async sincronizarPedidos(): Promise<void> {
    if (!this.enLinea || this.sincronizando) {
      return;
    }
    this.sincronizando = true;
    try {
      const pendientes = await this.storageService.obtenerPedidosPendientes();
      for (const pedido of pendientes) {
        try {
          const respuesta = await this.orderSyncService.enviar(pedido);
          await this.storageService.actualizarPedido({
            ...pedido,
            estado: respuesta.estado,
            idServidor: respuesta.id
          });
        } catch (error) {
          await this.storageService.actualizarPedido({ ...pedido, ultimoError: this.errorComoTexto(error) });
          this.mensaje = `El pedido sigue guardado y pendiente de sincronización: ${this.errorComoTexto(error)}`;
        }
      }
      await this.cargarPersistencia();
    } catch (error) {
      this.mensaje = `No se pudo revisar la cola de pedidos: ${this.errorComoTexto(error)}`;
    } finally {
      this.sincronizando = false;
    }
  }

  // Polling de respaldo para reflejar cambios si no llega un evento push.
  private async actualizarEstadosPedidos(): Promise<void> {
    if (!this.enLinea) {
      return;
    }
    try {
      const pedidos = await this.storageService.obtenerPedidos();
      for (const pedido of pedidos) {
        if (!pedido.idServidor || !['recibido', 'preparacion'].includes(pedido.estado)) {
          continue;
        }
        try {
          const respuesta = await this.orderSyncService.consultarEstado(pedido.idServidor);
          if (respuesta.estado !== pedido.estado) {
            await this.storageService.actualizarPedido({ ...pedido, estado: respuesta.estado });
            this.mensaje = `El pedido #${pedido.idServidor} ahora está: ${this.estadoLabel(respuesta.estado)}.`;
          }
        } catch (error) {
          this.mensaje = `No se pudo actualizar el pedido #${pedido.idServidor}: ${this.errorComoTexto(error)}`;
        }
      }
      await this.cargarPersistencia();
    } catch (error) {
      this.mensaje = `No se pudieron consultar los estados: ${this.errorComoTexto(error)}`;
    }
  }

  // Aplica al pedido local los datos de estado asociados al push recibido.
  private async aplicarActualizacionPush(payload: object): Promise<void> {
    try {
      const actualizacion = this.pushService.actualizacionDe(payload);
      const pedido = this.pedidos.find((item) => item.idServidor === actualizacion.pedidoId);
      if (pedido && actualizacion.estado) {
        await this.storageService.actualizarPedido({ ...pedido, estado: actualizacion.estado });
      }
      await this.cargarPersistencia();
    } catch (error) {
      this.mensaje = `No se pudo guardar la actualización del pedido: ${this.errorComoTexto(error)}`;
    }
  }

  // Traduce fallos de red/HTTP a mensajes útiles para la interfaz.
  private errorComoTexto(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.status === 0
        ? 'No hay respuesta del servidor. Comprueba la conexión y la URL de la API.'
        : `El servidor respondió con HTTP ${error.status}.`;
    }
    return error instanceof Error ? error.message : 'Error inesperado.';
  }
}
