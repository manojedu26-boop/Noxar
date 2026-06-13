import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Enforce relative asset paths for Electron file protocol loading
});
