#!/bin/bash
# Script para verificar variables de entorno en producción

echo "🔍 Verificando variables de entorno en el contenedor Docker..."
echo ""

# Obtener el nombre o ID del contenedor
CONTAINER=$(docker ps --filter "ancestor=occupational-health-system-app" --format "{{.ID}}" | head -1)

if [ -z "$CONTAINER" ]; then
    echo "❌ No se encontró el contenedor en ejecución"
    echo "   Intentando con nombre del servicio..."
    CONTAINER=$(docker ps --filter "name=app" --format "{{.ID}}" | head -1)
fi

if [ -z "$CONTAINER" ]; then
    echo "❌ No se encontró ningún contenedor en ejecución"
    echo ""
    echo "Contenedores disponibles:"
    docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Image}}"
    exit 1
fi

echo "✅ Contenedor encontrado: $CONTAINER"
echo ""


echo "📋 Variables de Base de Datos:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker exec $CONTAINER sh -c 'echo "DB_HOST: ${DB_HOST:-(vacío)}"'
docker exec $CONTAINER sh -c 'echo "DB_NAME: ${DB_NAME:-(vacío)}"'
docker exec $CONTAINER sh -c 'echo "DB_USER: ${DB_USER:-(vacío)}"'
echo ""

echo "📋 Otras variables:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker exec $CONTAINER sh -c 'echo "NODE_ENV: ${NODE_ENV:-(vacío)}"'
docker exec $CONTAINER sh -c 'echo "APP_BASE_URL: ${APP_BASE_URL:-(vacío)}"'
echo ""


echo "✅ Verificación completada"
