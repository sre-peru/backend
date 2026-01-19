/**
 * False Positive Analysis Controller
 * @module controllers/false-positive.controller
 * 
 * REST API endpoints for false positive analysis
 */

import { Request, Response, NextFunction } from 'express';
import { FalsePositiveService } from '../services/false-positive.service';
import {
  FPAnalysisRequest,
  FPClassification,
  FPThresholds,
  DEFAULT_FP_THRESHOLDS
} from '../types/false-positive.types';
import { SeverityLevel, ImpactLevel } from '../types/problem.types';
import { database } from '../config/database';

// =============================================================================
// CONTROLLER CLASS
// =============================================================================

export class FalsePositiveController {
  private service: FalsePositiveService | null = null;

  private async getService(): Promise<FalsePositiveService> {
    if (!this.service) {
      const db = database.getDb();
      this.service = new FalsePositiveService(db, 'problems');
    }
    return this.service;
  }

  // ===========================================================================
  // ANALYSIS ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/v1/analytics/false-positives
   * Run full false positive analysis
   */
  runAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      // Parse query parameters
      const request: FPAnalysisRequest = {
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        managementZones: this.parseArrayParam(req.query.managementZones),
        severityLevels: this.parseArrayParam(req.query.severityLevels) as SeverityLevel[],
        impactLevels: this.parseArrayParam(req.query.impactLevels) as ImpactLevel[],
        entityTypes: this.parseArrayParam(req.query.entityTypes),
        includeDetails: req.query.includeDetails === 'true',
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        thresholds: req.query.thresholds 
          ? JSON.parse(req.query.thresholds as string) 
          : undefined
      };

      const result = await service.runAnalysis(request);

      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/analytics/false-positives/summary
   * Get analysis summary only (no problem details) - OPTIMIZED
   */
  getSummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      // Use optimized aggregation-based summary
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      const managementZones = this.parseArrayParam(req.query.managementZones);

      const result = await service.getSummaryFast(dateFrom, dateTo, managementZones);

      res.json({
        success: true,
        summary: result.summary,
        recommendations: result.recommendations,
        generatedAt: result.generatedAt,
        executionTimeMs: result.executionTimeMs
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/analytics/false-positives/rate
   * Get just the false positive rate - OPTIMIZED
   */
  getFPRate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      // Use optimized aggregation-based summary
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      const managementZones = this.parseArrayParam(req.query.managementZones);

      const result = await service.getSummaryFast(dateFrom, dateTo, managementZones);

      res.json({
        success: true,
        totalProblems: result.summary.totalProblems,
        falsePositives: result.summary.falsePositives,
        truePositives: result.summary.truePositives,
        uncertain: result.summary.uncertain,
        falsePositiveRate: result.summary.falsePositiveRate,
        autoRemediationRate: result.summary.autoRemediationRate,
        dateRange: result.summary.dateRange
      });
    } catch (error) {
      next(error);
    }
  };

  // ===========================================================================
  // PROBLEM LIST ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/v1/analytics/false-positives/problems
   * Get paginated list of problems with FP analysis
   */
  getProblemsWithAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const classification = req.query.classification as FPClassification;
      const minScore = req.query.minScore ? parseFloat(req.query.minScore as string) : undefined;
      const maxScore = req.query.maxScore ? parseFloat(req.query.maxScore as string) : undefined;

      const request: FPAnalysisRequest = {
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        managementZones: this.parseArrayParam(req.query.managementZones),
        severityLevels: this.parseArrayParam(req.query.severityLevels) as SeverityLevel[],
        includeDetails: true
      };

      const result = await service.runAnalysis(request);

      // Filter by classification if specified
      let problems = result.problems || [];
      
      if (classification) {
        problems = problems.filter(p => p.fpAnalysis.classification === classification);
      }

      if (minScore !== undefined) {
        problems = problems.filter(p => p.fpAnalysis.score >= minScore);
      }

      if (maxScore !== undefined) {
        problems = problems.filter(p => p.fpAnalysis.score <= maxScore);
      }

      // Sort by FP score descending
      problems.sort((a, b) => b.fpAnalysis.score - a.fpAnalysis.score);

      // Paginate
      const total = problems.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const paginatedProblems = problems.slice(startIndex, startIndex + limit);

      res.json({
        success: true,
        problems: paginatedProblems,
        total,
        page,
        limit,
        totalPages,
        filters: {
          classification,
          minScore,
          maxScore
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/analytics/false-positives/problems/top
   * Get top false positives (highest FP scores)
   */
  getTopFalsePositives = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const limit = parseInt(req.query.limit as string, 10) || 10;

      const request: FPAnalysisRequest = {
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        includeDetails: true
      };

      const result = await service.runAnalysis(request);

      const topFP = (result.problems || [])
        .filter(p => p.fpAnalysis.classification === FPClassification.FALSE_POSITIVE)
        .sort((a, b) => b.fpAnalysis.score - a.fpAnalysis.score)
        .slice(0, limit)
        .map(p => ({
          problemId: p.problemId,
          displayId: p.displayId,
          title: p.title,
          duration: p.duration,
          severityLevel: p.severityLevel,
          startTime: p.startTime,
          fpScore: p.fpAnalysis.score,
          fpReasons: p.fpAnalysis.reasons.map(r => r.label),
          affectedEntity: p.affectedEntities?.[0]?.name || 'Unknown'
        }));

      res.json({
        success: true,
        topFalsePositives: topFP,
        total: topFP.length
      });
    } catch (error) {
      next(error);
    }
  };

  // ===========================================================================
  // ENTITY ANALYSIS ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/v1/analytics/false-positives/entities
   * Get entity recurrence analysis
   */
  getEntityAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const dateFrom = req.query.dateFrom 
        ? new Date(req.query.dateFrom as string) 
        : undefined;
      const dateTo = req.query.dateTo 
        ? new Date(req.query.dateTo as string) 
        : undefined;

      const entities = await service.analyzeEntityRecurrence(dateFrom, dateTo);

      // Optional filtering
      const minProblems = req.query.minProblems 
        ? parseInt(req.query.minProblems as string, 10) 
        : undefined;
      const entityType = req.query.entityType as string;

      let filteredEntities = entities;

      if (minProblems) {
        filteredEntities = filteredEntities.filter(e => e.totalProblems >= minProblems);
      }

      if (entityType) {
        filteredEntities = filteredEntities.filter(e => e.entityType === entityType);
      }

      res.json({
        success: true,
        entities: filteredEntities,
        total: filteredEntities.length
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/analytics/false-positives/entities/:entityId
   * Get analysis for a specific entity
   */
  getEntityById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();
      const { entityId } = req.params;

      const entities = await service.analyzeEntityRecurrence();
      const entity = entities.find(e => e.entityId === entityId);

      if (!entity) {
        res.status(404).json({
          success: false,
          message: `Entity ${entityId} not found`
        });
        return;
      }

      res.json({
        success: true,
        entity
      });
    } catch (error) {
      next(error);
    }
  };

  // ===========================================================================
  // DASHBOARD ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/v1/analytics/false-positives/dashboard/kpis
   * Get dashboard KPIs
   */
  getDashboardKPIs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      const kpis = await service.getDashboardKPIs(dateFrom, dateTo);

      res.json({
        success: true,
        kpis
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/analytics/false-positives/dashboard/widgets
   * Get all widget data for dashboard
   */
  getDashboardWidgets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      const widgetData = await service.getWidgetData(dateFrom, dateTo);

      res.json({
        success: true,
        ...widgetData
      });
    } catch (error) {
      next(error);
    }
  };

  // ===========================================================================
  // DISTRIBUTION ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/v1/analytics/false-positives/distribution/duration
   * Get FP distribution by duration
   */
  getDurationDistribution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const result = await service.runAnalysis({
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        includeDetails: false
      });

      res.json({
        success: true,
        distribution: result.summary.byDuration,
        total: result.summary.totalProblems
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/analytics/false-positives/distribution/severity
   * Get FP distribution by severity
   */
  getSeverityDistribution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const result = await service.runAnalysis({
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        includeDetails: false
      });

      res.json({
        success: true,
        distribution: result.summary.bySeverity,
        total: result.summary.totalProblems
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/analytics/false-positives/distribution/reasons
   * Get distribution by FP reasons
   */
  getReasonDistribution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const result = await service.runAnalysis({
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        includeDetails: false
      });

      res.json({
        success: true,
        distribution: result.summary.byReason,
        total: result.summary.totalProblems
      });
    } catch (error) {
      next(error);
    }
  };

  // ===========================================================================
  // TREND ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/v1/analytics/false-positives/trend/daily
   * Get daily FP trend
   */
  getDailyTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      const result = await service.runAnalysis({
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        includeDetails: false
      });

      res.json({
        success: true,
        trend: result.summary.dailyTrend
      });
    } catch (error) {
      next(error);
    }
  };

  // ===========================================================================
  // CONFIGURATION ENDPOINTS
  // ===========================================================================

  /**
   * GET /api/v1/analytics/false-positives/thresholds
   * Get current thresholds
   */
  getThresholds = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();

      res.json({
        success: true,
        thresholds: service.getThresholds(),
        defaults: DEFAULT_FP_THRESHOLDS
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/analytics/false-positives/thresholds
   * Update thresholds
   */
  updateThresholds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.getService();
      const newThresholds: Partial<FPThresholds> = req.body;

      // Validate
      if (newThresholds.fpScoreThreshold !== undefined) {
        if (newThresholds.fpScoreThreshold < 0 || newThresholds.fpScoreThreshold > 1) {
          res.status(400).json({
            success: false,
            message: 'fpScoreThreshold must be between 0 and 1'
          });
          return;
        }
      }

      service.setThresholds(newThresholds);

      res.json({
        success: true,
        message: 'Thresholds updated successfully',
        thresholds: service.getThresholds()
      });
    } catch (error) {
      next(error);
    }
  };

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private parseArrayParam(param: any): string[] | undefined {
    if (!param) return undefined;
    if (Array.isArray(param)) return param;
    if (typeof param === 'string') {
      return param.split(',').map(s => s.trim()).filter(Boolean);
    }
    return undefined;
  }
}

// Export singleton instance
export const falsePositiveController = new FalsePositiveController();
export default falsePositiveController;
