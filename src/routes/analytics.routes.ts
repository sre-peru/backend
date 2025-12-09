/**
 * Analytics Routes
 */
import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/v1/analytics/kpis
router.get('/kpis', analyticsController.getKPIs);

// GET /api/v1/analytics/time-series
router.get('/time-series', analyticsController.getTimeSeries);

// GET /api/v1/analytics/impact-severity-matrix
router.get('/impact-severity-matrix', analyticsController.getImpactSeverityMatrix);

// GET /api/v1/analytics/top-entities
router.get('/top-entities', analyticsController.getTopEntities);

// GET /api/v1/analytics/management-zones
router.get('/management-zones', analyticsController.getManagementZones);

// GET /api/v1/analytics/remediation-funnel
router.get('/remediation-funnel', analyticsController.getRemediationFunnel);

// GET /api/v1/analytics/duration-distribution
router.get('/duration-distribution', analyticsController.getDurationDistribution);

// GET /api/v1/analytics/evidence-types
router.get('/evidence-types', analyticsController.getEvidenceTypes);

// GET /api/v1/analytics/root-cause-analysis
router.get('/root-cause-analysis', analyticsController.getRootCauseAnalysis);

// GET /api/v1/analytics/root-cause-distribution
router.get('/root-cause-distribution', analyticsController.getRootCauseDistribution);

// GET /api/v1/analytics/impact-distribution
router.get('/impact-distribution', analyticsController.getImpactDistribution);

// GET /api/v1/analytics/severity-distribution
router.get('/severity-distribution', analyticsController.getSeverityDistribution);

// GET /api/v1/analytics/has-root-cause-distribution
router.get('/has-root-cause-distribution', analyticsController.getHasRootCauseDistribution);

export default router;
