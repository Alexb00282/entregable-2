import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { CatalogoService, Precio, Producto } from './services/catalogo.service';

@Component({
    selector: 'app-root',
    imports: [CommonModule],
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

  constructor(private readonly catalogoService: CatalogoService) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  @HostListener('window:online')
  alConectar(): void {
    this.enLinea = true;
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

  private cargarDatos(): void {
    this.cargandoCatalogo = true;
    this.errorCatalogo = false;
    this.errorPrecios = false;

    this.catalogoService.obtenerCatalogo().subscribe({
      next: (productos) => {
        this.productos = productos;
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
}
