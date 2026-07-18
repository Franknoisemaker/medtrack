# MedTrack — Política de Backup y Recuperación de Base de Datos

> **Clasificación:** Infraestructura Crítica — Datos de Salud  
> **Última actualización:** 2026-06-11  
> **Responsable:** Equipo de ingeniería MedTrack

---

## Resumen

MedTrack almacena expedientes médicos y datos sensibles de pacientes en **Supabase (PostgreSQL)**. Esta política define los mecanismos de backup implementados para garantizar la disponibilidad y recuperabilidad de los datos ante cualquier incidente.

---

## Estrategia de Backup (3-2-1)

| Capa | Almacenamiento | Retención | Frecuencia |
|------|---------------|-----------|------------|
| **1** | GitHub Artifacts | 90 días | Diario (02:00 UTC) |
| **2** | Cloudflare R2 | 365 días | Diario (automático) |
| **3** | Supabase PITR | 7 días | Continuo (nativo) |

> [!IMPORTANT]
> Supabase Pro incluye **Point-in-Time Recovery (PITR)** de 7 días. Esta es la primera línea de defensa. Los workflows de este repo son la segunda y tercera capa.

---

## Backups Automáticos

### GitHub Actions — `db-backup.yml`

Se ejecuta **todos los días a las 02:00 UTC** (20:00 CST).

**Pasos:**
1. Conecta a la BD de producción usando la Supabase CLI
2. Ejecuta `pg_dump` (dump lógico completo)
3. Comprime con `gzip -9`
4. Valida que el archivo no esté vacío (falla si < 1 KB)
5. Sube el `.sql.gz` como GitHub Artifact (90 días)
6. Sube una copia a Cloudflare R2 (365 días)
7. Limpia backups de R2 con más de 365 días

**Para ejecutar manualmente:**
1. Ir a GitHub → Actions → `DB — Backup Automático Producción`
2. Click en **Run workflow**
3. Ingresar el motivo (ej: "Antes de migración")
4. Seleccionar si subir también a R2

---

## Backup Manual Local

Para hacer un backup desde tu máquina local:

```bash
# Asegúrate de tener pg_dump instalado
brew install postgresql   # macOS

# Ejecutar el script (las variables se leen del .env automáticamente)
./scripts/db-backup.sh
```

El archivo se guarda en `.backups/` (carpeta excluida del git).

**Limpieza automática:** el script elimina backups locales de más de 7 días.

---

## Secrets Requeridos en GitHub

Asegúrate de que los siguientes secrets existen en el ambiente `production`:

| Secret | Descripción |
|--------|-------------|
| `SUPABASE_ACCESS_TOKEN` | Token de acceso a la Supabase Management API |
| `SUPABASE_PROJECT_REF_PRODUCTION` | Ref del proyecto de producción |
| `SUPABASE_DB_PASSWORD_PRODUCTION` | Contraseña de la BD de producción |
| `R2_ACCOUNT_ID` | ID de cuenta de Cloudflare |
| `R2_ACCESS_KEY_ID` | Clave de acceso a R2 |
| `R2_SECRET_ACCESS_KEY` | Clave secreta de R2 |
| `R2_BUCKET_NAME` | Nombre del bucket R2 (ej: `medtrack-backups`) |

---

## Procedimiento de Restauración

> [!CAUTION]
> La restauración sobreescribe datos existentes. Siempre hacer un backup previo a la restauración.

### Opción 1: Restaurar desde GitHub Artifact

1. Ir a GitHub → Actions → `DB — Backup Automático Producción`
2. Seleccionar el workflow run del día deseado
3. Descargar el artifact `medtrack-db-backup-<timestamp>`
4. Restaurar:

```bash
# Descomprimir
gunzip medtrack_prod_<timestamp>.sql.gz

# Restaurar (sustituir variables)
psql \
  --host="db.<PROJECT_REF>.supabase.co" \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  -f medtrack_prod_<timestamp>.sql
```

### Opción 2: Restaurar desde Cloudflare R2

```bash
# Listar backups disponibles
rclone ls r2:medtrack-backups/database-backups/

# Descargar el backup deseado
rclone copy "r2:medtrack-backups/database-backups/2026/06/medtrack_prod_<timestamp>.sql.gz" ./

# Restaurar
gunzip medtrack_prod_<timestamp>.sql.gz
psql -h "db.<PROJECT_REF>.supabase.co" -U postgres -d postgres -f medtrack_prod_<timestamp>.sql
```

### Opción 3: Point-in-Time Recovery (PITR) — Supabase

Para recuperar hasta 7 días atrás sin necesidad de backups manuales:

1. Ir al [Dashboard de Supabase](https://supabase.com/dashboard)
2. Seleccionar el proyecto de producción
3. Ir a **Settings → Database → Backups**
4. Seleccionar el punto de restauración deseado
5. Confirmar la restauración (el proyecto se pausará brevemente)

---

## Alertas y Monitoreo

El workflow de backup envía una notificación de estado en GitHub. Si el backup **falla**:

1. GitHub marcará el workflow como fallido (visible en la pestaña Actions)
2. Revisar los logs del step `Ejecutar pg_dump`
3. Causas comunes:
   - Contraseña expirada → rotar `SUPABASE_DB_PASSWORD_PRODUCTION`
   - IP bloqueada → verificar allowlist en Supabase
   - Cuota de artifacts agotada → limpiar artifacts antiguos

---

## Checklist de Verificación Mensual

- [ ] Ejecutar un backup manual y verificar que el archivo no está vacío
- [ ] Probar restauración en ambiente de staging con el backup más reciente
- [ ] Verificar que los secrets de GitHub siguen vigentes
- [ ] Revisar el historial de workflows (todos deben ser verdes)
- [ ] Confirmar que R2 tiene backups de los últimos 30 días

---

## Referencias

- [Workflow de backup](.github/workflows/db-backup.yml)
- [Script de backup manual](scripts/db-backup.sh)
- [Supabase PITR Documentation](https://supabase.com/docs/guides/platform/backups)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
