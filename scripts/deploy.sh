#!/bin/bash

# =============================================================================
# Script de Despliegue - Manuales MEA
# =============================================================================
# Uso: ./scripts/deploy.sh [opcion]
# Opciones:
#   (sin opcion)  - Despliegue completo (pull + build + restart)
#   --quick       - Solo restart (sin rebuild)
#   --build-only  - Solo rebuild sin restart
#   --status      - Ver estado de contenedores
#   --logs        - Ver logs de todos los contenedores
#   --logs-f      - Ver logs en tiempo real (follow)
# =============================================================================

set -e  # Salir si hay error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directorio del proyecto
PROJECT_DIR="/opt/manuales-gse"

# Funciones de utilidad
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Verificar que estamos en el directorio correcto
check_directory() {
    if [ ! -f "$PROJECT_DIR/docker-compose.yml" ]; then
        print_error "No se encontró docker-compose.yml en $PROJECT_DIR"
        exit 1
    fi
    cd "$PROJECT_DIR"
    print_success "Directorio: $PROJECT_DIR"
}

# Ver estado de contenedores
show_status() {
    print_header "Estado de Contenedores"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAME|manuales"
}

# Ver logs
show_logs() {
    print_header "Logs de Contenedores"
    docker compose logs --tail=50
}

# Ver logs en tiempo real
show_logs_follow() {
    print_header "Logs en Tiempo Real (Ctrl+C para salir)"
    docker compose logs -f
}

# Pull de cambios desde git
git_pull() {
    print_header "Actualizando código desde Git"

    # Guardar el commit actual
    OLD_COMMIT=$(git rev-parse --short HEAD)

    # Pull
    git fetch origin
    git reset --hard origin/main

    # Nuevo commit
    NEW_COMMIT=$(git rev-parse --short HEAD)

    if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
        print_warning "Sin cambios nuevos (commit: $NEW_COMMIT)"
    else
        print_success "Actualizado: $OLD_COMMIT → $NEW_COMMIT"
        echo -e "\nCambios:"
        git log --oneline ${OLD_COMMIT}..${NEW_COMMIT}
    fi
}

# Rebuild de contenedores
docker_build() {
    print_header "Reconstruyendo Contenedores"

    echo "Deteniendo contenedores..."
    docker compose down

    echo -e "\nReconstruyendo imágenes..."
    docker compose build --no-cache

    print_success "Build completado"
}

# Iniciar contenedores
docker_up() {
    print_header "Iniciando Contenedores"
    docker compose up -d

    # Esperar un momento para que inicien
    sleep 3

    print_success "Contenedores iniciados"
}

# Quick restart (sin rebuild)
quick_restart() {
    print_header "Reinicio Rápido"
    docker compose restart
    sleep 2
    print_success "Reinicio completado"
}

# Verificar salud de los servicios
health_check() {
    print_header "Verificación de Salud"

    # Verificar que todos los contenedores estén corriendo
    RUNNING=$(docker ps --filter "name=manuales" --filter "status=running" -q | wc -l)
    TOTAL=4  # nginx, frontend, backend, certbot

    if [ "$RUNNING" -ge 3 ]; then
        print_success "Contenedores corriendo: $RUNNING/$TOTAL"
    else
        print_error "Solo $RUNNING/$TOTAL contenedores corriendo"
        echo -e "\nContenedores con problemas:"
        docker ps -a --filter "name=manuales" --format "table {{.Names}}\t{{.Status}}"
        return 1
    fi

    # Verificar backend health
    echo -e "\nVerificando backend..."
    if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        print_success "Backend respondiendo"
    else
        print_warning "Backend no responde en localhost:8000"
    fi

    # Verificar frontend
    echo -e "\nVerificando frontend..."
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        print_success "Frontend respondiendo"
    else
        print_warning "Frontend no responde en localhost:3000"
    fi
}

# Despliegue completo
full_deploy() {
    print_header "DESPLIEGUE COMPLETO - Manuales MEA"
    echo "Fecha: $(date)"

    check_directory
    git_pull
    docker_build
    docker_up
    health_check
    show_status

    print_header "DESPLIEGUE COMPLETADO"
    echo -e "Aplicación disponible en: ${GREEN}https://manualesmea.mx${NC}\n"
}

# Menú principal
case "$1" in
    --quick)
        check_directory
        git_pull
        quick_restart
        health_check
        show_status
        ;;
    --build-only)
        check_directory
        docker_build
        ;;
    --status)
        check_directory
        show_status
        ;;
    --logs)
        check_directory
        show_logs
        ;;
    --logs-f)
        check_directory
        show_logs_follow
        ;;
    --help|-h)
        echo "Uso: $0 [opcion]"
        echo ""
        echo "Opciones:"
        echo "  (sin opcion)  - Despliegue completo (pull + build + restart)"
        echo "  --quick       - Pull + restart rápido (sin rebuild)"
        echo "  --build-only  - Solo rebuild sin restart"
        echo "  --status      - Ver estado de contenedores"
        echo "  --logs        - Ver últimos 50 logs"
        echo "  --logs-f      - Ver logs en tiempo real"
        echo "  --help        - Mostrar esta ayuda"
        ;;
    *)
        full_deploy
        ;;
esac
