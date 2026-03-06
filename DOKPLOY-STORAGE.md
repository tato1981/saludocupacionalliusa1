# Configuración de Almacenamiento Persistente en Dokploy

Esta guía explica cómo configurar bind mounts en Dokploy para mantener las imágenes subidas de forma persistente, independientemente de los redeploys del contenedor.

## ¿Por qué necesitamos esto?

Cuando se reconstruye o actualiza un contenedor Docker, todos los archivos dentro del contenedor se pierden. Para evitar perder las imágenes subidas por los usuarios (fotos de pacientes, firmas, etc.), usamos **bind mounts** que mapean una carpeta del servidor host a una carpeta dentro del contenedor.

## Arquitectura de Almacenamiento

```
Servidor Host (Dokploy)          Contenedor Docker
━━━━━━━━━━━━━━━━━━━━━━          ━━━━━━━━━━━━━━━━━━
/path/to/data/uploads/    ←→    /data/uploads/
    ├── patients/                   ├── patients/
    │   ├── 1/                      │   ├── 1/
    │   │   ├── photo_xxx.webp     │   │   ├── photo_xxx.webp
    │   │   └── signature_xxx.png   │   │   └── signature_xxx.png
    │   └── 2/                      │   └── 2/
    └── ...                          └── ...
```

## Configuración en Dokploy

### Opción 1: Usando la Interfaz Web de Dokploy

#### Paso 1: Crear el directorio en el servidor

Conéctate por SSH a tu servidor Dokploy y crea el directorio para los uploads:

```bash
# Crear directorio con permisos adecuados
sudo mkdir -p /dokploy/data/occupational-health/uploads
sudo chmod -R 755 /dokploy/data/occupational-health/uploads
```

#### Paso 2: Configurar el Mount en Dokploy

1. Accede a tu aplicación en el panel de Dokploy
2. Ve a la sección **"Mounts"** o **"Volumes"**
3. Agrega un nuevo mount:
   - **Host Path:** `/dokploy/data/occupational-health/uploads`
   - **Container Path:** `/data/uploads`
   - **Type:** `bind`

#### Paso 3: Configurar Variables de Entorno

En la sección de **Environment Variables** de Dokploy, agrega:

```bash
UPLOADS_DIR=/data/uploads
```

Esta variable le indica a la aplicación dónde guardar los archivos.

#### Paso 4: Redesplegar

Guarda los cambios y redesplega la aplicación. Los archivos ahora se guardarán en el servidor host y persistirán entre deploys.

---

### Opción 2: Usando Docker Compose en Dokploy

Si Dokploy soporta despliegues con docker-compose, puedes usar el archivo `docker-compose.yml` incluido en el proyecto:

#### Paso 1: Preparar el directorio

```bash
# En el servidor, crear el directorio
sudo mkdir -p /dokploy/data/occupational-health/uploads
sudo chmod -R 755 /dokploy/data/occupational-health/uploads
```

#### Paso 2: Modificar docker-compose.yml

El archivo `docker-compose.yml` ya incluye la configuración necesaria:

```yaml
volumes:
  - /dokploy/data/occupational-health/uploads:/data/uploads
```

Asegúrate de actualizar la ruta del host según tu configuración de Dokploy.

#### Paso 3: Variables de Entorno

Verifica que la variable `UPLOADS_DIR=/data/uploads` esté configurada en el archivo `.env` o en las variables de entorno de Dokploy.

---

## Verificación

### 1. Verificar que el mount está activo

Una vez desplegado, puedes verificar que el bind mount funciona:

```bash
# Conectarse al contenedor
docker exec -it <nombre-contenedor> sh

# Verificar el directorio
ls -la /data/uploads
```

Deberías ver el directorio con los permisos correctos.

### 2. Probar subida de archivos

1. Accede a la aplicación web
2. Sube una foto de prueba de un paciente
3. Verifica en el servidor host que el archivo se creó:

```bash
ls -la /dokploy/data/occupational-health/uploads/patients/
```

### 3. Verificar persistencia

1. Redesplega o reinicia el contenedor
2. Verifica que los archivos siguen disponibles
3. Intenta acceder a la imagen desde la aplicación web

---

## Consideraciones de Seguridad

### Permisos del Directorio

Los archivos deben tener permisos adecuados para que la aplicación pueda leer y escribir:

```bash
# Dar permisos al usuario que corre el contenedor (usualmente 1000:1000 en Node Alpine)
sudo chown -R 1000:1000 /dokploy/data/occupational-health/uploads
sudo chmod -R 755 /dokploy/data/occupational-health/uploads
```

### Backup

Es importante configurar backups del directorio de uploads:

```bash
# Ejemplo de backup con rsync
rsync -av /dokploy/data/occupational-health/uploads/ /ruta/backup/uploads-$(date +%Y%m%d)/
```

### Espacio en Disco

Monitorea el espacio en disco usado por los uploads:

```bash
# Ver tamaño del directorio
du -sh /dokploy/data/occupational-health/uploads
```

---

## Troubleshooting

### Problema: Las imágenes no se guardan

**Solución:**
1. Verifica que `UPLOADS_DIR=/data/uploads` esté configurado
2. Verifica los logs del contenedor:
   ```bash
   docker logs <nombre-contenedor>
   ```
3. Busca mensajes como `"✅ Local Storage: Upload directory created"`

### Problema: Error de permisos

**Solución:**
```bash
# Ajustar permisos
sudo chown -R 1000:1000 /dokploy/data/occupational-health/uploads
sudo chmod -R 755 /dokploy/data/occupational-health/uploads
```

### Problema: Las imágenes desaparecen después de un deploy

**Solución:**
- Verifica que el bind mount esté correctamente configurado
- Asegúrate de que la ruta del host sea absoluta y no relativa
- Verifica que Dokploy no esté recreando el directorio

### Problema: No puedo acceder a las imágenes desde la web

**Solución:**
1. Verifica que el middleware esté sirviendo los archivos
2. Abre la consola del navegador y verifica las URLs
3. Las URLs deben ser: `https://tudominio.com/uploads/patients/...`

---

## Migración de ImageKit a Local Storage

Si estás migrando desde ImageKit:

### Paso 1: Descargar imágenes existentes

Si tienes imágenes en ImageKit que necesitas migrar, descárgalas primero a tu máquina local.

### Paso 2: Copiar al servidor

```bash
# Desde tu máquina local
scp -r ./imagenes-backup user@servidor:/dokploy/data/occupational-health/uploads/
```

### Paso 3: Actualizar base de datos

Si las URLs en la base de datos apuntan a ImageKit, necesitarás actualizarlas:

```sql
-- Ejemplo para MySQL
UPDATE patients
SET photo = REPLACE(photo, 'https://ik.imagekit.io/...', 'https://tudominio.com/uploads')
WHERE photo LIKE 'https://ik.imagekit.io%';

UPDATE patients
SET signature = REPLACE(signature, 'https://ik.imagekit.io/...', 'https://tudominio.com/uploads')
WHERE signature LIKE 'https://ik.imagekit.io%';
```

---

## Estructura de Archivos

El sistema guarda los archivos en la siguiente estructura:

```
/data/uploads/
├── patients/
│   └── {patient_id}/
│       ├── photo_{timestamp}.webp          # Foto optimizada para web
│       ├── certificate_{timestamp}.webp    # Versión para certificados
│       └── signature_{timestamp}.{ext}     # Firma del paciente
```

## URLs Públicas

Las imágenes son accesibles públicamente en:

```
https://tudominio.com/uploads/patients/{patient_id}/{filename}
```

Ejemplo:
```
https://saludocupacional.online/uploads/patients/123/photo_1234567890.webp
```

---

## Recursos Adicionales

- [Documentación oficial de Docker Volumes](https://docs.docker.com/storage/volumes/)
- [Documentación de Dokploy](https://docs.dokploy.com/)
- [Guía de bind mounts en Docker](https://docs.docker.com/storage/bind-mounts/)
