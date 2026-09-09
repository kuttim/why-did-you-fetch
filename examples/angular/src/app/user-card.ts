import { Component, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface User {
  name: string;
}

@Component({
  selector: 'app-user-card',
  template: `<div style="border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem 1rem">
    <strong>UserCard:</strong> {{ user()?.name ?? 'Loading…' }}
  </div>`,
})
export class UserCard {
  private http = inject(HttpClient);
  id = input.required<number>();
  user = signal<User | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      this.user.set(null);
      this.http.get<User>(`https://jsonplaceholder.typicode.com/users/${id}`).subscribe((u) => this.user.set(u));
    });
  }
}
