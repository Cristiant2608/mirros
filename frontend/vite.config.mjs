import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'frontend',
  plugins: [react(), {name: 'hevc-module', transform(code, id) { if (id.endsWith('/assets/hevc_dimensions.js')) return code + '\nexport {iosScrcpyHevcDimensions};'; }}],
  build: {outDir: '../src/mirros/web', emptyOutDir: true, rollupOptions: {output: {entryFileNames: 'viewer.js', codeSplitting: false, assetFileNames: 'viewer.[ext]'}}},
});
