# 🚀 Integración Rápida - False Positives API

## Archivos a copiar

```
src/
├── services/
│   └── false-positives.service.ts
├── controllers/
│   └── false-positives.controller.ts
└── routes/
    └── false-positives.routes.ts
```

## Paso 1: Copiar archivos a tu proyecto

Copia los 3 archivos a tu proyecto `dynatrace-tres/backend/src/`

## Paso 2: Registrar las rutas

En tu `app.ts` o `server.ts`, agrega:

```typescript
import falsePositivesRoutes from './routes/false-positives.routes';

// Después de tus otras rutas...
app.use('/api/v1/false-positives', falsePositivesRoutes);
```

## Paso 3: Verificar que getDatabase existe

El servicio usa `getDatabase()` de `../config/database`. Asegúrate de que existe:

```typescript
// src/config/database.ts
import { Db } from 'mongodb';

let db: Db;

export function setDatabase(database: Db) {
  db = database;
}

export function getDatabase(): Db {
  if (!db) throw new Error('Database not initialized');
  return db;
}
```

## Paso 4: Reiniciar el servidor

```bash
npm run dev
```

## Paso 5: Probar endpoints

```bash
# Resumen
curl http://localhost:3000/api/v1/false-positives/summary

# Análisis
curl http://localhost:3000/api/v1/false-positives/analysis

# Por entidad
curl http://localhost:3000/api/v1/false-positives/by-entity

# Recurrentes
curl http://localhost:3000/api/v1/false-positives/recurring

# Recomendaciones
curl http://localhost:3000/api/v1/false-positives/recommendations
```

## Endpoints disponibles

| Endpoint | Descripción |
|----------|-------------|
| GET /summary | Métricas principales y distribuciones |
| GET /analysis | Lista de problemas con FP score |
| GET /by-entity | Agrupado por entidad |
| GET /recurring | Entidades con alta recurrencia |
| GET /recommendations | Recomendaciones automáticas |

## Query params disponibles

- `startDate` - Fecha inicio (ISO)
- `endDate` - Fecha fin (ISO)
- `status` - OPEN | CLOSED
- `severityLevel` - RESOURCE_CONTENTION | AVAILABILITY | ERROR | PERFORMANCE
- `managementZone` - Nombre de zona
- `classification` - FALSE_POSITIVE | TRUE_POSITIVE | UNCERTAIN
- `page` - Página (default: 1)
- `limit` - Items por página (default: 50)
