import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, HostListener, OnInit } from '@angular/core';
import { CatalogoService, Precio, Producto } from './services/catalogo.service';
import { CarritoItem, MensajeGuardado, PedidoGuardado, StorageService, VentaGuardada } from './services/storage.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  readonly title = 'Backus Ventas';
  productos: Producto[] = [];
  precios: Precio[] = [];
  terminoBusqueda = '';
  enLinea = typeof navigator === 'undefined' || navigator.onLine;
  cargandoCatalogo = true;
  errorCatalogo = false;
  errorPrecios = false;
  mensaje = '';
  mensajeGuardado = '';
  productoPedido = 1;
  cantidadPedido = 1;
  observacionPedido = '';
  pedidosPendientes: PedidoGuardado[] = [];
  mensajesPendientes: MensajeGuardado[] = [];
  cartItems: CarritoItem[] = [];
  ventas: VentaGuardada[] = [];
  private productosBase: Producto[] = [];
  nuevoProducto = {
    nombre: '',
    categoria: 'Cerveza',
    precio: 0,
    stock: 0
  };

  constructor(
    private readonly catalogoService: CatalogoService,
    private readonly storageService: StorageService
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
    void this.cargarPersistencia();
  }

  @HostListener('window:online')
  alConectar(): void {
    this.enLinea = true;
    void this.cargarPersistencia();
  }

  @HostListener('window:offline')
  alDesconectar(): void {
    this.enLinea = false;
  }

  get productosFiltrados(): Producto[] {
    const termino = this.terminoBusqueda.trim().toLocaleLowerCase('es');
    return this.productos.filter((producto) =>
      `${producto.nombre} ${producto.categoria}`.toLocaleLowerCase('es').includes(termino)
    );
  }

  get stockTotal(): number {
    return this.productos.reduce((total, producto) => total + producto.stock, 0);
  }

  get totalCarrito(): number {
    return this.cartItems.reduce((total, item) => total + item.cantidad * item.precio, 0);
  }

  get totalVentas(): number {
    return this.ventas.reduce((total, venta) => total + venta.total, 0);
  }

  get productoSeleccionado(): Producto | undefined {
    return this.productos.find((producto) => producto.id === this.productoPedido);
  }

  get stockDisponiblePedido(): number {
    return this.obtenerStockDisponible(this.productoPedido);
  }

  obtenerPrecio(producto: Producto): Precio {
    return this.precios.find((precio) => precio.productoId === producto.id) ?? {
      productoId: producto.id,
      precio: producto.precio,
      stock: producto.stock,
      actualizado: ''
    };
  }

  recargar(): void {
    this.cargarDatos();
  }

  actualizarBusqueda(event: Event): void {
    this.terminoBusqueda = (event.target as HTMLInputElement).value;
  }

  agregarProducto(): void {
    const nombre = this.nuevoProducto.nombre.trim();
    const categoria = this.nuevoProducto.categoria.trim() || 'General';
    const precio = Number(this.nuevoProducto.precio);
    const stock = Number(this.nuevoProducto.stock);

    if (!nombre || Number.isNaN(precio) || Number.isNaN(stock) || precio < 0 || stock < 0) {
      this.mensajeGuardado = 'Completa los datos del producto para agregarlo al catálogo.';
      return;
    }

    const nuevoId = this.productos.reduce((max, producto) => Math.max(max, producto.id), 0) + 1;
    const producto: Producto = {
      id: nuevoId,
      nombre,
      categoria,
      precio: Number(precio.toFixed(2)),
      stock: Math.trunc(stock)
    };

    this.productosBase = [...this.productosBase, producto];
    this.productos = [...this.productos, producto];
    this.productoPedido = producto.id;
    this.nuevoProducto = { nombre: '', categoria: 'Cerveza', precio: 0, stock: 0 };
    this.mensajeGuardado = `Producto agregado: ${producto.nombre}.`;
  }

  quitarProducto(productoId: number): void {
    const producto = this.productos.find((item) => item.id === productoId);

    if (!producto) {
      return;
    }

    this.productos = this.productos.filter((item) => item.id !== productoId);
    this.productosBase = this.productosBase.filter((item) => item.id !== productoId);
    this.cartItems = this.cartItems.filter((item) => item.productoId !== productoId);
    this.storageService.guardarCarrito(this.cartItems);
    this.mensajeGuardado = `Producto eliminado: ${producto.nombre}.`;

    if (this.productoPedido === productoId && this.productos.length > 0) {
      this.productoPedido = this.productos[0].id;
    }
  }

  agregarAlCarrito(productId: number): void {
    const productoBase = this.productosBase.find((item) => item.id === productId);
    const productoActual = this.productos.find((item) => item.id === productId);
    const disponible = this.obtenerStockDisponible(productId);

    if (!productoBase || !productoActual || disponible <= 0) {
      this.mensajeGuardado = 'No hay stock disponible para este producto.';
      return;
    }

    const itemExistente = this.cartItems.find((item) => item.productoId === productId);
    if (itemExistente && itemExistente.cantidad >= disponible) {
      this.mensajeGuardado = `No puedes agregar más de ${disponible} unidades de ${productoBase.nombre}.`;
      return;
    }

    if (itemExistente) {
      itemExistente.cantidad += 1;
      itemExistente.fecha = new Date().toISOString();
    } else {
      this.cartItems = [
        ...this.cartItems,
        {
          productoId: productoBase.id,
          nombre: productoBase.nombre,
          categoria: productoBase.categoria,
          precio: this.obtenerPrecio(productoBase).precio,
          cantidad: 1,
          fecha: new Date().toISOString()
        }
      ];
    }

    this.storageService.guardarCarrito(this.cartItems);
    this.actualizarStockDesdeCarrito();
    this.mensajeGuardado = `${productoBase.nombre} agregado al carrito.`;
  }

  quitarDelCarrito(productId: number): void {
    const item = this.cartItems.find((producto) => producto.productoId === productId);
    if (!item) {
      return;
    }

    if (item.cantidad > 1) {
      item.cantidad -= 1;
      item.fecha = new Date().toISOString();
    } else {
      this.cartItems = this.cartItems.filter((producto) => producto.productoId !== productId);
    }

    this.storageService.guardarCarrito(this.cartItems);
    this.actualizarStockDesdeCarrito();
    this.mensajeGuardado = `Se quitó 1 unidad del carrito.`;
  }

  async guardarMensaje(): Promise<void> {
    const texto = this.mensaje.trim();

    if (!texto) {
      return;
    }

    if (this.enLinea) {
      this.mensajeGuardado = 'Mensaje enviado para revisión inmediata.';
      this.mensaje = '';
      return;
    }

    await this.storageService.guardarMensaje({ texto, fecha: new Date().toISOString(), estado: 'pendiente' });
    this.mensaje = '';
    this.mensajeGuardado = 'Mensaje guardado localmente. Se sincronizará cuando vuelva la conexión.';
    await this.cargarPersistencia();
  }

  validarCantidadPedido(valor: number): void {
    const disponible = this.obtenerStockDisponible(this.productoPedido);
    if (valor > disponible) {
      this.cantidadPedido = disponible;
      this.mensajeGuardado = `La cantidad máxima disponible es ${disponible} unidades.`;
      return;
    }

    this.cantidadPedido = Math.max(1, valor || 1);
  }

  async guardarPedido(): Promise<void> {
    const producto = this.productos.find((item) => item.id === this.productoPedido);

    if (!producto) {
      return;
    }

    const disponible = this.obtenerStockDisponible(producto.id);
    if (this.cantidadPedido > disponible) {
      this.mensajeGuardado = `La cantidad solicitada supera el stock disponible (${disponible} unidades).`;
      this.cantidadPedido = disponible || 1;
      return;
    }

    const pedido: PedidoGuardado = {
      producto: producto.nombre,
      cantidad: this.cantidadPedido,
      total: Number((producto.precio * this.cantidadPedido).toFixed(2)),
      observaciones: this.observacionPedido.trim(),
      fecha: new Date().toISOString(),
      estado: 'pendiente'
    };

    const productoBase = this.productosBase.find((item) => item.id === producto.id);
    if (productoBase) {
      productoBase.stock = Math.max(0, productoBase.stock - this.cantidadPedido);
      this.guardarVenta({
        productoId: productoBase.id,
        nombre: productoBase.nombre,
        categoria: productoBase.categoria,
        cantidad: this.cantidadPedido,
        total: Number((productoBase.precio * this.cantidadPedido).toFixed(2)),
        fecha: new Date().toISOString(),
        estado: 'confirmada'
      });
    }

    this.actualizarStockDesdeCarrito();

    if (this.enLinea) {
      this.mensajeGuardado = `Pedido para ${producto.nombre} registrado y enviado para revisión.`;
      this.productoPedido = producto.id;
      this.cantidadPedido = 1;
      this.observacionPedido = '';
      return;
    }

    await this.storageService.guardarPedido(pedido);
    this.mensajeGuardado = `Pedido guardado localmente para sincronizar cuando vuelva Internet.`;
    this.cantidadPedido = 1;
    this.observacionPedido = '';
    await this.cargarPersistencia();
  }

  confirmarCompra(): void {
    if (this.cartItems.length === 0) {
      this.mensajeGuardado = 'Tu carrito está vacío.';
      return;
    }

    const errores: string[] = [];

    for (const item of this.cartItems) {
      const producto = this.productosBase.find((productoActual) => productoActual.id === item.productoId);
      if (!producto) {
        errores.push(`No existe el producto ${item.nombre}.`);
        continue;
      }

      const disponible = this.obtenerStockDisponible(item.productoId);
      if (item.cantidad > disponible) {
        errores.push(`No puedes vender ${item.cantidad} unidades de ${item.nombre}; solo quedan ${disponible}.`);
      }
    }

    if (errores.length > 0) {
      this.mensajeGuardado = errores[0];
      return;
    }

    for (const item of this.cartItems) {
      const producto = this.productosBase.find((productoActual) => productoActual.id === item.productoId);
      if (!producto) {
        continue;
      }

      producto.stock = Math.max(0, producto.stock - item.cantidad);
      this.guardarVenta({
        productoId: producto.id,
        nombre: producto.nombre,
        categoria: producto.categoria,
        cantidad: item.cantidad,
        total: Number((item.precio * item.cantidad).toFixed(2)),
        fecha: new Date().toISOString(),
        estado: 'confirmada'
      });
    }

    this.cartItems = [];
    this.storageService.guardarCarrito(this.cartItems);
    this.actualizarStockDesdeCarrito();
    this.mensajeGuardado = 'Compra confirmada correctamente. El stock fue actualizado.';
  }

  private cargarDatos(): void {
    this.cargandoCatalogo = true;
    this.errorCatalogo = false;
    this.errorPrecios = false;

    this.catalogoService.obtenerCatalogo().subscribe({
      next: (productos) => {
        this.productosBase = productos.map((producto) => ({ ...producto }));
        this.productos = productos.map((producto) => ({ ...producto }));
        this.productoPedido = productos[0]?.id ?? 1;
        this.actualizarStockDesdeCarrito();
        this.cargandoCatalogo = false;
      },
      error: () => {
        this.errorCatalogo = true;
        this.cargandoCatalogo = false;
      }
    });

    this.catalogoService.obtenerPrecios().subscribe({
      next: (precios) => this.precios = precios,
      error: () => this.errorPrecios = true
    });
  }

  private async cargarPersistencia(): Promise<void> {
    try {
      const [pedidos, mensajes] = await Promise.all([
        this.storageService.obtenerPedidos(),
        this.storageService.obtenerMensajes()
      ]);

      this.pedidosPendientes = pedidos;
      this.mensajesPendientes = mensajes;
      this.cartItems = this.storageService.obtenerCarrito();
      this.ventas = this.storageService.obtenerVentas();
      this.actualizarStockDesdeCarrito();
    } catch {
      this.pedidosPendientes = [];
      this.mensajesPendientes = [];
      this.cartItems = [];
      this.ventas = [];
    }
  }

  private guardarVenta(venta: Omit<VentaGuardada, 'id'>): void {
    this.ventas = [
      {
        ...venta,
        id: Date.now() + Math.floor(Math.random() * 1000)
      },
      ...this.ventas
    ];
    this.storageService.guardarVentas(this.ventas);
  }

  private obtenerStockDisponible(productoId: number): number {
    const base = this.productosBase.find((producto) => producto.id === productoId);
    if (!base) {
      return 0;
    }

    const reservados = this.cartItems
      .filter((item) => item.productoId === productoId)
      .reduce((total, item) => total + item.cantidad, 0);

    return Math.max(0, base.stock - reservados);
  }

  private actualizarStockDesdeCarrito(): void {
    if (this.productosBase.length === 0) {
      return;
    }

    this.productos = this.productosBase.map((producto) => {
      const itemEnCarrito = this.cartItems.find((item) => item.productoId === producto.id);
      return {
        ...producto,
        stock: Math.max(0, producto.stock - (itemEnCarrito?.cantidad ?? 0))
      };
    });
  }
}
