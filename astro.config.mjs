// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// https://astro.build/config
export default defineConfig({
  output: 'server',
  security: {
    checkOrigin: false,
  },
  adapter: node({
    mode: 'standalone'
  }),
  integrations: [tailwind()],
  vite: {
    define: {
      'process.env.DB_HOST': JSON.stringify(process.env.DB_HOST),
      'process.env.DB_PORT': JSON.stringify(process.env.DB_PORT),
      'process.env.DB_USER': JSON.stringify(process.env.DB_USER),
      'process.env.DB_PASSWORD': JSON.stringify(process.env.DB_PASSWORD),
      'process.env.DB_NAME': JSON.stringify(process.env.DB_NAME),
      'process.env.JWT_SECRET': JSON.stringify(process.env.JWT_SECRET),
    },
    server: {
      // Servir archivos de la carpeta uploads en desarrollo
      fs: {
        allow: ['..']
      }
    }
  }
});

