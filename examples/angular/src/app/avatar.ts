import { Component, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface User {
  name: string;
}

@Component({
  selector: 'app-avatar',
  template: `<div style="border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem 1rem">
    <strong>Avatar:</strong> {{ user()?.name ?? 'Loading…' }}
  </div>`,
})
export class Avatar {
  private http = inject(HttpClient);
  id = input.required<number>();
  user = signal<User | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      this.user.set(null);
      // Same endpoint as UserCard — fetched independently. Neither component knows the other
      // is fetching the same user at the same time.
      this.http.get<User>(`https://jsonplaceholder.typicode.com/users/${id}`).subscribe((u) => this.user.set(u));
    });
  }
}
