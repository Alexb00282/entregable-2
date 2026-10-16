import { TestBed } from '@angular/core/testing';
import { EMPTY, of } from 'rxjs';
import { AppComponent } from './app.component';
import { CatalogoService, Producto } from './services/catalogo.service';
import { OrderSyncService } from './services/order-sync.service';
import { PushService } from './services/push.service';
import { StorageService } from './services/storage.service';

const menu: Producto[] = [
  {
    id: 1,
    nombre: 'Hamburguesa clásica',
    categoria: 'Hamburguesas',
    precio: 18.9,
    stock: 30,
    descripcion: 'Queso cheddar y salsa de la casa.',
    emoji: '🍔'
  }
];

// Las dependencias se sustituyen para probar la vista sin red ni IndexedDB real.
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: CatalogoService, useValue: { obtenerCatalogo: () => of(menu), revalidationErrors$: EMPTY } },
        {
          provide: StorageService,
          useValue: {
            obtenerPedidos: async () => [],
            obtenerPedidosPendientes: async () => [],
            obtenerCarrito: async () => [],
            guardarCarrito: async () => undefined,
            guardarPedido: async () => undefined,
            actualizarPedido: async () => undefined
          }
        },
        { provide: OrderSyncService, useValue: { enviar: async () => undefined, consultarEstado: async () => undefined } },
        {
          provide: PushService,
          useValue: {
            disponible: false,
            messages$: EMPTY,
            suscribir: async () => undefined,
            mensajeDe: () => '',
            actualizacionDe: () => ({})
          }
        }
      ]
    }).compileComponents();
  });

  // La aplicación debe iniciar y exponer el nombre nuevo del producto académico.
  it('creates the FastOrder app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toBe('FastOrder');
  });

  // Confirma que el menú recibido se presenta y el getter devuelve coincidencias.
  it('loads and filters the restaurant menu', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.productos[0].nombre).toBe('Hamburguesa clásica');
    expect(fixture.componentInstance.productosFiltrados).toEqual(menu);
  });

  // Verifica totales y que el rastreador solo marque pasos ya alcanzados.
  it('calculates a cart total and order step progression', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.productos = menu;
    app.agregarAlCarrito(menu[0]);
    expect(app.totalCarrito).toBe(18.9);
    expect(app.pasoActivo('preparacion', 'recibido')).toBeTrue();
    expect(app.pasoActivo('preparacion', 'listo')).toBeFalse();
  });
});
