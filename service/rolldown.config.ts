import { defineConfig } from 'rolldown';

// Bundles src/ and its production dependencies into one minified file
// (Rolldown uses the Oxc transformer and minifier), so the runtime image
// needs no node_modules.
export default defineConfig({
  input: 'src/app.ts',
  platform: 'node',
  output: {
    file: 'dist/app.mjs',
    format: 'esm',
    minify: true,
    sourcemap: true,
  },
});
