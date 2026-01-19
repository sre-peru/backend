// ============================================================================
// FALSE POSITIVES ROUTES
// ============================================================================
// Path: src/routes/false-positives.routes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { falsePositivesController } from '../controllers/false-positives.controller';

const router = Router();

// GET /api/v1/false-positives/summary
// Resumen ejecutivo con métricas principales
// Query params: startDate, endDate, status, severityLevel, managementZone
router.get('/summary', (req: Request, res: Response, next: NextFunction) => 
  falsePositivesController.getSummary(req, res, next)
);

// GET /api/v1/false-positives/analysis
// Lista de problemas con score de falso positivo
// Query params: startDate, endDate, status, severityLevel, managementZone, classification, page, limit
router.get('/analysis', (req: Request, res: Response, next: NextFunction) => 
  falsePositivesController.getAnalysis(req, res, next)
);

// GET /api/v1/false-positives/by-entity
// Análisis agrupado por entidad
// Query params: startDate, endDate, status, severityLevel, page, limit
router.get('/by-entity', (req: Request, res: Response, next: NextFunction) => 
  falsePositivesController.getByEntity(req, res, next)
);

// GET /api/v1/false-positives/recurring
// Entidades con problemas recurrentes
// Query params: startDate, endDate, minOccurrences
router.get('/recurring', (req: Request, res: Response, next: NextFunction) => 
  falsePositivesController.getRecurring(req, res, next)
);

// GET /api/v1/false-positives/recommendations
// Recomendaciones basadas en el análisis
// Query params: startDate, endDate
router.get('/recommendations', (req: Request, res: Response, next: NextFunction) => 
  falsePositivesController.getRecommendations(req, res, next)
);

export default router;
