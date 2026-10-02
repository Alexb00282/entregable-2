import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { CatalogoService } from './services/catalogo.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{
        provide: CatalogoService,
        useValue: {
          obtenerCatalogo: () => of([
            { id: 1, nombre: 'Cristal 620 ml', categoria: 'Cerveza', precio: 3.4, stock: 120 }
          ]),
          obtenerPrecios: () => of([
            { productoId: 1, precio: 3.5, stock: 118, actualizado: '2026-10-01T09:00:00' }
          ])
        }
      }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should have the Backus Ventas title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Backus Ventas');
  });

  it('should load the academic product catalog', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.productos[0].nombre).toBe('Cristal 620 ml');
    expect(fixture.componentInstance.obtenerPrecio(fixture.componentInstance.productos[0]).precio).toBe(3.5);
  });
});
