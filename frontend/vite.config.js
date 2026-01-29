import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      basicSsl()
    ],
    base: env.VITE_APP_BASE_PATH || '/',
    server: {
      host: true,
      https: true, // Force HTTPS
    }
  };
});
