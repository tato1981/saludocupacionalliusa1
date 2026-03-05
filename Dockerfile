# Etapa 1: Construcción
FROM node:20-alpine AS builder

# Instalar dependencias necesarias para compilación
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar TODAS las dependencias (incluyendo devDependencies)
RUN npm ci

# Copiar el resto de archivos
COPY . .

# Construir la aplicación
RUN npm run build

# Etapa 2: Producción
FROM node:20-alpine AS runner

WORKDIR /app

# Instalar dependencias necesarias para runtime (especialmente para sharp/imágenes)
# libc6-compat es necesario para binarios precompilados de sharp en Alpine
RUN apk add --no-cache libc6-compat

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar SOLO dependencias de producción
# Esto asegura que sharp se instale correctamente para la arquitectura actual (Alpine)
# y reduce el tamaño de la imagen final
RUN npm ci --omit=dev && npm cache clean --force

# Copiar los archivos construidos desde la etapa anterior
COPY --from=builder /app/dist ./dist

# Crear directorios para uploads (aunque usemos R2, pueden ser útiles para temporales o fallbacks)
RUN mkdir -p /app/uploads/patients /app/uploads/signatures && \
    chmod -R 755 /app/uploads

# Variables de entorno para Cloudflare R2 (DOCUMENTACIÓN)
# Estas variables DEBEN ser proporcionadas al ejecutar el contenedor
# ENV R2_ACCOUNT_ID=
# ENV R2_ACCESS_KEY_ID=
# ENV R2_SECRET_ACCESS_KEY=
# ENV R2_BUCKET_NAME=
# ENV R2_PUBLIC_URL=

# Configuración del servidor
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production

EXPOSE 4321

# Iniciar la aplicación
CMD ["node", "./dist/server/entry.mjs"]
