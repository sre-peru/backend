# 🔍 False Positive Analysis - Integración

## 📁 Archivos a Copiar

Copia los siguientes archivos a tu proyecto `dynatrace-tres`:

```
backend/src/
├── types/
│   └── false-positive.types.ts     # ← Copiar aquí
├── services/
│   └── false-positive.service.ts   # ← Copiar aquí
├── controllers/
│   └── false-positive.controller.ts # ← Copiar aquí
└── routes/
    └── false-positive.routes.ts    # ← Copiar aquí
```

## 🔧 Integración

### 1. Registrar las rutas en tu app principal

En tu archivo `app.ts` o donde configures las rutas:

```typescript
import falsePositiveRoutes from './routes/false-positive.routes';

// ... otras rutas ...

app.use('/api/v1/analytics/false-positives', falsePositiveRoutes);
```

### 2. Verificar import del database

Asegúrate que el import de `getDb` coincida con tu configuración:

```typescript
// En false-positive.controller.ts, línea 12
import { getDb } from '../config/database';

// Si tu función se llama diferente, ajusta el import
```

### 3. Ajustar imports de types

En `false-positive.service.ts`, verifica el path a tus types:

```typescript
// Línea 14
import {
  Problem,
  SeverityLevel,
  ImpactLevel,
  ProblemStatus
} from '../types/problem.types';
```

## 🚀 Endpoints Disponibles

### Análisis Principal
```
GET /api/v1/analytics/false-positives
GET /api/v1/analytics/false-positives/summary
GET /api/v1/analytics/false-positives/rate
```

### Lista de Problemas
```
GET /api/v1/analytics/false-positives/problems
GET /api/v1/analytics/false-positives/problems/top
```

### Análisis de Entidades
```
GET /api/v1/analytics/false-positives/entities
GET /api/v1/analytics/false-positives/entities/:entityId
```

### Dashboard
```
GET /api/v1/analytics/false-positives/dashboard/kpis
GET /api/v1/analytics/false-positives/dashboard/widgets
```

### Distribuciones
```
GET /api/v1/analytics/false-positives/distribution/duration
GET /api/v1/analytics/false-positives/distribution/severity
GET /api/v1/analytics/false-positives/distribution/reasons
```

### Tendencias
```
GET /api/v1/analytics/false-positives/trend/daily
```

### Configuración
```
GET /api/v1/analytics/false-positives/thresholds
PUT /api/v1/analytics/false-positives/thresholds
```

## 📊 Ejemplos de Uso

### Obtener resumen de análisis
```bash
curl "http://localhost:3000/api/v1/analytics/false-positives/summary"
```

### Filtrar por fechas
```bash
curl "http://localhost:3000/api/v1/analytics/false-positives/rate?dateFrom=2025-01-01&dateTo=2025-01-31"
```

### Obtener top 10 falsos positivos
```bash
curl "http://localhost:3000/api/v1/analytics/false-positives/problems/top?limit=10"
```

### Filtrar problemas por clasificación
```bash
curl "http://localhost:3000/api/v1/analytics/false-positives/problems?classification=FALSE_POSITIVE&page=1&limit=20"
```

### Obtener entidades con más de 5 problemas
```bash
curl "http://localhost:3000/api/v1/analytics/false-positives/entities?minProblems=5"
```

### Obtener datos para dashboard
```bash
curl "http://localhost:3000/api/v1/analytics/false-positives/dashboard/widgets"
```

### Modificar umbrales
```bash
curl -X PUT "http://localhost:3000/api/v1/analytics/false-positives/thresholds" \
  -H "Content-Type: application/json" \
  -d '{"fpScoreThreshold": 0.5, "veryShortDurationMinutes": 3}'
```

## 🎯 Criterios de Clasificación

| Criterio | Peso | Descripción |
|----------|------|-------------|
| Duración < 5 min | +0.35 | Problema muy transitorio |
| Duración 5-15 min | +0.20 | Problema corto |
| Auto-remediación exitosa | +0.25 | Se resolvió automáticamente |
| Auto-remediación intentada | +0.15 | Hubo intento de auto-remediar |
| Cierre manual rápido | +0.15 | Cerrado manualmente en < 10 min |
| Severidad baja | +0.10 | RESOURCE_CONTENTION o PERFORMANCE |
| Sin comentarios | +0.05 | Nadie investigó el problema |

### Clasificación Final
- **Score ≥ 0.6** → `FALSE_POSITIVE`
- **Score 0.3 - 0.6** → `UNCERTAIN`
- **Score < 0.3** → `TRUE_POSITIVE`

## 🔄 Respuesta de Ejemplo

```json
{
  "success": true,
  "summary": {
    "totalProblems": 10547,
    "falsePositives": 4218,
    "truePositives": 4876,
    "uncertain": 1453,
    "falsePositiveRate": 0.4,
    "autoRemediationRate": 0.35,
    "byDuration": {
      "<5min": 3200,
      "5-15min": 2100,
      "15-60min": 2800,
      "1-4h": 1500,
      ">4h": 947
    },
    "topRecurringEntities": [
      {
        "entityId": "PROCESS_GROUP_INSTANCE-XXX",
        "entityName": "SpringBoot ms-ne-notificacion...",
        "totalProblems": 156,
        "falsePositiveRate": 0.72,
        "recommendation": "Alta tasa de FP. Considere ajustar umbrales."
      }
    ]
  },
  "recommendations": [
    "⚠️ ALTO: 40% tasa de falsos positivos. Considere ajustar los umbrales.",
    "🤖 35% de problemas auto-remediados. Considere aumentar umbrales.",
    "🔄 12 entidades con alta recurrencia. Revisar configuración."
  ],
  "generatedAt": "2025-01-17T15:30:00.000Z",
  "executionTimeMs": 1234
}
```

## ✅ Testing

Después de integrar, prueba con:

```bash
# 1. Verificar que la ruta responde
curl http://localhost:3000/api/v1/analytics/false-positives/rate

# 2. Ejecutar análisis completo
curl http://localhost:3000/api/v1/analytics/false-positives/summary

# 3. Obtener KPIs del dashboard
curl http://localhost:3000/api/v1/analytics/false-positives/dashboard/kpis
```

## 🛠 Troubleshooting

### Error: "Cannot find module '../config/database'"
- Ajusta el import de `getDb` a tu configuración

### Error: "Property 'Autoremediado' does not exist"
- El servicio ya maneja esto con `as any`, pero si quieres tipado estricto, añade a `Problem`:
```typescript
interface Problem {
  // ... existing fields ...
  Autoremediado?: string;
  FuncionoAutoRemediacion?: string;
}
```

### Performance lento con +10k documentos
- Usa el parámetro `limit` para analizar por lotes
- Considera crear índices en MongoDB:
```javascript
db.problems.createIndex({ startTime: -1 })
db.problems.createIndex({ "affectedEntities.entityId.id": 1 })
db.problems.createIndex({ severityLevel: 1, status: 1 })
```
