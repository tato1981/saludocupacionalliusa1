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

# Crear directorio para uploads persistentes (se montará con bind mount)
# Usamos /data/uploads como ubicación estándar para datos persistentes
RUN mkdir -p /data/uploads/patients && \
    chmod -R 755 /data

# Configuración del servidor
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production
ENV UPLOADS_DIR=/data/uploads

# Volumen para datos persistentes (bind mount)
VOLUME ["/data/uploads"]

EXPOSE 4321

# Iniciar la aplicación
CMD ["node", "./dist/server/entry.mjs"]
