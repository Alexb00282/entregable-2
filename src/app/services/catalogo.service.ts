import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Producto {
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
}

export interface Precio {
  productoId: number;
  precio: number;
  stock: number;
  actualizado: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly http = inject(HttpClient);

  obtenerCatalogo(): Observable<Producto[]> {
    return this.http.get<Producto[]>('/data/catalogo.json');
  }

  obtenerPrecios(): Observable<Precio[]> {
    return this.http.get<Precio[]>('/data/precios.json');
  }
}