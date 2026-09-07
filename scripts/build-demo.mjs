import { build } from 'esbuild';

await build({
  entryPoints: ['docs/demo.ts'],
  outfile: 'docs/demo.js',
  bundle: false,
  format: 'esm',
  target: 'es2020',
  logLevel: 'info',
});
