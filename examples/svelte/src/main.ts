import { mount } from 'svelte';
import { init } from 'why-did-you-fetch';
import App from './App.svelte';

// Called here, at the true entry point, before Svelte mounts anything — the simplest way to
// guarantee every component's first-mount fetch is caught. See ../vite-react for a case (React)
// where installing the patch inside a component's own lifecycle hook instead would actually
// miss requests, and why.
init();

mount(App, { target: document.getElementById('app')! });
