import { Component, signal } from '@angular/core';
import { UserCard } from './user-card';
import { Avatar } from './avatar';

@Component({
  selector: 'app-root',
  imports: [UserCard, Avatar],
  template: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 3rem auto; line-height: 1.6">
    <h1>why-did-you-fetch — Angular example</h1>
    <p>
      Open devtools' console. <code>UserCard</code> and <code>Avatar</code> below each independently fetch the same user
      on mount — you should see a <code>duplicate-inflight</code> warning as soon as the page loads.
    </p>
    <button (click)="userId.set(userId() + 1)">Load a different user (id: {{ userId() }})</button>
    <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem">
      <app-user-card [id]="userId()" />
      <app-avatar [id]="userId()" />
    </div>
  </div>`,
})
export class App {
  userId = signal(1);
}
