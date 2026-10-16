import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, concat, defer, from, map, of, switchMap, throwError } from 'rxjs';
import { Subject } from 'rxjs';
import { StorageService } from './storage.service';

export interface Producto {
  // Identificador estable que usa la plantilla y el carrito.
  id: number;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  descripcion: string;
  emoji: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(StorageService);
  private readonly revalidationErrors = new Subject<unknown>();
  readonly revalidationErrors$ = this.revalidationErrors.asObservable();

  // SWR: emite primero IndexedDB si existe, luego pide el menú más reciente.
  obtenerCatalogo(): Observable<Producto[]> {
    return defer(() => from(this.storage.obtenerMenu<Producto>()).pipe(
      switchMap((cached) => {
        const actualizar = this.http.get<Producto[]>('/data/catalogo.json').pipe(
          switchMap((productos) => from(this.storage.guardarMenu(productos)).pipe(map(() => productos))),
          catchError((error: unknown) => {
            if (!cached?.length) {
              // Sin copia offline, propaga el error para que la vista lo muestre.
              return throwError(() => error);
            }
            // Conserva el menú viejo y notifica que la revalidación remota falló.
            this.revalidationErrors.next(error);
            return of(cached);
          })
        );
        return cached?.length ? concat(of(cached), actualizar) : actualizar;
      })
    ));
  }
}