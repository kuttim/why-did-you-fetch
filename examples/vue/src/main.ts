import { createApp } from 'vue';
import { init } from 'why-did-you-fetch';
import App from './App.vue';

// Called here, at the true entry point, before Vue mounts anything — the simplest way to
// guarantee every component's first-mount fetch is caught, regardless of a framework's own
// component/effect ordering. See ../vite-react for a case (React) where installing it inside a
// parent component's lifecycle hook instead would actually miss requests, and why.
init();

createApp(App).mount('#app');
