#!/usr/bin/env bash
# =============================================================================
# MedTrack — Backup Manual de Base de Datos de Producción
# =============================================================================
#
# USO:
#   ./scripts/db-backup.sh
#
# REQUISITOS:
#   • pg_dump instalado  (brew install postgresql  en macOS)
#   • Variables de entorno seteadas (ver abajo) o archivo .env local
#
# VARIABLES REQUERIDAS:
#   SUPABASE_PROJECT_REF   → Ref del proyecto Supabase (ej: abcdefghijklmnop)
#   SUPABASE_DB_PASSWORD   → Contraseña de la base de datos
#
# EJEMPLO DE USO LOCAL:
#   SUPABASE_PROJECT_REF=abcdef SUPABASE_DB_PASSWORD=mipass ./scripts/db-backup.sh
#
# =============================================================================

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

log()    { echo -e "${BLUE}[INFO]${RESET} $*"; }
success(){ echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()   { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()  { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}   MedTrack — Backup de Base de Datos Producción  ${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo ""

# ── Cargar .env si existe ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/expediente-medico-app/.env"

if [ -f "${ENV_FILE}" ]; then
  log "Cargando variables desde ${ENV_FILE}..."
  # Exportar solo las vars relevantes sin ejecutar código arbitrario
  set -o allexport
  # shellcheck disable=SC1090
  source <(grep -E '^SUPABASE_' "${ENV_FILE}" 2>/dev/null || true)
  set +o allexport
fi

# ── Validar variables requeridas ──────────────────────────────────────────────
MISSING=()
[ -z "${SUPABASE_PROJECT_REF:-}" ] && MISSING+=("SUPABASE_PROJECT_REF")
[ -z "${SUPABASE_DB_PASSWORD:-}" ] && MISSING+=("SUPABASE_DB_PASSWORD")

if [ ${#MISSING[@]} -gt 0 ]; then
  error "Faltan las siguientes variables de entorno:"
  for VAR in "${MISSING[@]}"; do
    error "  • ${VAR}"
  done
  echo ""
  echo -e "  Ejemplo:"
  echo -e "  ${YELLOW}SUPABASE_PROJECT_REF=abcdef SUPABASE_DB_PASSWORD=mipass ./scripts/db-backup.sh${RESET}"
  echo ""
  exit 1
fi

# ── Verificar dependencias ────────────────────────────────────────────────────
if ! command -v pg_dump &>/dev/null; then
  error "pg_dump no está instalado."
  echo ""
  echo "  Instalar en macOS:"
  echo -e "  ${YELLOW}brew install postgresql${RESET}"
  echo ""
  exit 1
fi

PG_VERSION=$(pg_dump --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
log "pg_dump versión: ${PG_VERSION}"

# ── Configuración ─────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BACKUP_DIR="${PROJECT_ROOT}/.backups"
DUMP_FILE="${BACKUP_DIR}/medtrack_prod_${TIMESTAMP}.sql"
DUMP_GZ="${DUMP_FILE}.gz"

DB_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
DB_PORT=5432
DB_USER=postgres
DB_NAME=postgres

log "Host: ${DB_HOST}"
log "Directorio de backups: ${BACKUP_DIR}"
log "Archivo de salida: medtrack_prod_${TIMESTAMP}.sql.gz"
echo ""

# ── Crear directorio de backups ───────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# Asegurarse de que .backups está en .gitignore
GITIGNORE="${PROJECT_ROOT}/.gitignore"
if ! grep -q "^\.backups" "${GITIGNORE}" 2>/dev/null; then
  echo "" >> "${GITIGNORE}"
  echo "# Backups locales de base de datos (NO commitear)" >> "${GITIGNORE}"
  echo ".backups/" >> "${GITIGNORE}"
  warn "Se agregó .backups/ al .gitignore raíz automáticamente"
fi

# ── Ejecutar pg_dump ──────────────────────────────────────────────────────────
log "Iniciando pg_dump a producción..."
echo ""

PGPASSWORD="${SUPABASE_DB_PASSWORD}" pg_dump \
  --host="${DB_HOST}" \
  --port=${DB_PORT} \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=plain \
  --no-password \
  --clean \
  --if-exists \
  --no-acl \
  --no-owner \
  --verbose \
  > "${DUMP_FILE}" 2>&1

if [ $? -ne 0 ]; then
  error "pg_dump falló. Revisa las credenciales y la conectividad."
  rm -f "${DUMP_FILE}"
  exit 1
fi

# ── Validar que el dump no está vacío ─────────────────────────────────────────
DUMP_SIZE=$(stat -f%z "${DUMP_FILE}" 2>/dev/null || stat -c%s "${DUMP_FILE}")
if [ "${DUMP_SIZE}" -lt 1024 ]; then
  error "El dump parece vacío o muy pequeño (${DUMP_SIZE} bytes). Abortando."
  rm -f "${DUMP_FILE}"
  exit 1
fi

success "pg_dump completado ($(( DUMP_SIZE / 1024 )) KB sin comprimir)"

# ── Comprimir ─────────────────────────────────────────────────────────────────
log "Comprimiendo con gzip -9..."
gzip -9 "${DUMP_FILE}"

GZ_SIZE=$(stat -f%z "${DUMP_GZ}" 2>/dev/null || stat -c%s "${DUMP_GZ}")
success "Compresión completada ($(( GZ_SIZE / 1024 )) KB)"

# ── Listar backups locales existentes ─────────────────────────────────────────
BACKUP_COUNT=$(find "${BACKUP_DIR}" -name "*.sql.gz" | wc -l | tr -d ' ')

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
success "¡Backup completado exitosamente!"
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  📦 Archivo: ${GREEN}$(basename "${DUMP_GZ}")${RESET}"
echo -e "  📁 Ruta:    ${DUMP_GZ}"
echo -e "  📏 Tamaño:  $(( GZ_SIZE / 1024 )) KB"
echo -e "  🗂️  Total backups locales: ${BACKUP_COUNT}"
echo ""

# ── Limpiar backups locales > 7 días ─────────────────────────────────────────
DELETED=$(find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +7 -print -delete 2>/dev/null | wc -l | tr -d ' ')
if [ "${DELETED}" -gt 0 ]; then
  warn "Se eliminaron ${DELETED} backup(s) local(es) de más de 7 días"
fi

echo -e "  💡 Para restaurar este backup:"
echo -e "  ${YELLOW}gunzip -c ${DUMP_GZ} | psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME}${RESET}"
echo ""
