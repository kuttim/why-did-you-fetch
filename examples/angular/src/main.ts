import { bootstrapApplication } from '@angular/platform-browser';
import { init } from 'why-did-you-fetch';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Called here, at the true entry point, before Angular bootstraps anything — see
// ../vite-react's README for why this matters in frameworks where installing the patch inside a
// component's own lifecycle hook instead can miss requests. Angular's HttpClient (the default XHR
// backend, used here) sits on top of XMLHttpRequest, which init() patches directly.
init();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
