import { defineConfig } from 'vite';
// base './' 讓網站放在 GitHub Pages 的子路徑（/倉庫名/）也能正常運作
export default defineConfig({ base: './', build: { outDir: 'dist', chunkSizeWarningLimit: 1200 } });
