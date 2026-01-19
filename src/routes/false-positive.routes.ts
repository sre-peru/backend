/**
 * False Positive Analysis Routes
 * @module routes/false-positive.routes
 * 
 * API routes for false positive analysis
 * 
 * Base path: /api/v1/analytics/false-positives
 */

import { Router } from 'express';
import { falsePositiveController } from '../controllers/false-positive.controller';

const router = Router();

// =============================================================================
// MAIN ANALYSIS ROUTES
// =============================================================================

/**
 * @route   GET /api/v1/analytics/false-positives
 * @desc    Run full false positive analysis
 * @query   dateFrom, dateTo, managementZones, severityLevels, impactLevels,
 *          entityTypes, includeDetails, limit, thresholds
 * @access  Public
 */
router.get('/', falsePositiveController.runAnalysis);

/**
 * @route   GET /api/v1/analytics/false-positives/summary
 * @desc    Get analysis summary only (no problem details)
 * @query   dateFrom, dateTo, managementZones
 * @access  Public
 */
router.get('/summary', falsePositiveController.getSummary);

/**
 * @route   GET /api/v1/analytics/false-positives/rate
 * @desc    Get just the false positive rate
 * @query   dateFrom, dateTo, managementZones
 * @access  Public
 */
router.get('/rate', falsePositiveController.getFPRate);

// =============================================================================
// PROBLEM LIST ROUTES
// =============================================================================

/**
 * @route   GET /api/v1/analytics/false-positives/problems
 * @desc    Get paginated list of problems with FP analysis
 * @query   page, limit, classification, minScore, maxScore, dateFrom, dateTo,
 *          managementZones, severityLevels
 * @access  Public
 */
router.get('/problems', falsePositiveController.getProblemsWithAnalysis);

/**
 * @route   GET /api/v1/analytics/false-positives/problems/top
 * @desc    Get top false positives (highest FP scores)
 * @query   limit, dateFrom, dateTo
 * @access  Public
 */
router.get('/problems/top', falsePositiveController.getTopFalsePositives);

// =============================================================================
// ENTITY ANALYSIS ROUTES
// =============================================================================

/**
 * @route   GET /api/v1/analytics/false-positives/entities
 * @desc    Get entity recurrence analysis
 * @query   dateFrom, dateTo, minProblems, entityType
 * @access  Public
 */
router.get('/entities', falsePositiveController.getEntityAnalysis);

/**
 * @route   GET /api/v1/analytics/false-positives/entities/:entityId
 * @desc    Get analysis for a specific entity
 * @params  entityId
 * @access  Public
 */
router.get('/entities/:entityId', falsePositiveController.getEntityById);

// =============================================================================
// DASHBOARD ROUTES
// =============================================================================

/**
 * @route   GET /api/v1/analytics/false-positives/dashboard/kpis
 * @desc    Get dashboard KPIs
 * @query   dateFrom, dateTo
 * @access  Public
 */
router.get('/dashboard/kpis', falsePositiveController.getDashboardKPIs);

/**
 * @route   GET /api/v1/analytics/false-positives/dashboard/widgets
 * @desc    Get all widget data for dashboard
 * @query   dateFrom, dateTo
 * @access  Public
 */
router.get('/dashboard/widgets', falsePositiveController.getDashboardWidgets);

// =============================================================================
// DISTRIBUTION ROUTES
// =============================================================================

/**
 * @route   GET /api/v1/analytics/false-positives/distribution/duration
 * @desc    Get FP distribution by duration
 * @query   dateFrom, dateTo
 * @access  Public
 */
router.get('/distribution/duration', falsePositiveController.getDurationDistribution);

/**
 * @route   GET /api/v1/analytics/false-positives/distribution/severity
 * @desc    Get FP distribution by severity
 * @query   dateFrom, dateTo
 * @access  Public
 */
router.get('/distribution/severity', falsePositiveController.getSeverityDistribution);

/**
 * @route   GET /api/v1/analytics/false-positives/distribution/reasons
 * @desc    Get distribution by FP reasons
 * @query   dateFrom, dateTo
 * @access  Public
 */
router.get('/distribution/reasons', falsePositiveController.getReasonDistribution);

// =============================================================================
// TREND ROUTES
// =============================================================================

/**
 * @route   GET /api/v1/analytics/false-positives/trend/daily
 * @desc    Get daily FP trend
 * @query   dateFrom, dateTo
 * @access  Public
 */
router.get('/trend/daily', falsePositiveController.getDailyTrend);

// =============================================================================
// CONFIGURATION ROUTES
// =============================================================================

/**
 * @route   GET /api/v1/analytics/false-positives/thresholds
 * @desc    Get current thresholds
 * @access  Public
 */
router.get('/thresholds', falsePositiveController.getThresholds);

/**
 * @route   PUT /api/v1/analytics/false-positives/thresholds
 * @desc    Update thresholds
 * @body    { veryShortDurationMinutes?, shortDurationMinutes?, fpScoreThreshold?, ... }
 * @access  Public
 */
router.put('/thresholds', falsePositiveController.updateThresholds);

export default router;
