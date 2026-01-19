// ============================================================================
// FALSE POSITIVES CONTROLLER
// ============================================================================
// Path: src/controllers/false-positives.controller.ts

import { Request, Response, NextFunction } from 'express';
import { falsePositivesService } from '../services/false-positives.service';
import { sendSuccess } from '../utils/response.utils';

interface FPFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  severityLevel?: string;
  managementZone?: string;
  entityType?: string;
  classification?: 'FALSE_POSITIVE' | 'TRUE_POSITIVE' | 'UNCERTAIN';
}

function extractFilters(query: Record<string, unknown>): FPFilters {
  return {
    startDate: query.startDate as string | undefined,
    endDate: query.endDate as string | undefined,
    status: query.status as string | undefined,
    severityLevel: query.severityLevel as string | undefined,
    managementZone: query.managementZone as string | undefined,
    entityType: query.entityType as string | undefined,
    classification: query.classification as 'FALSE_POSITIVE' | 'TRUE_POSITIVE' | 'UNCERTAIN' | undefined,
  };
}

export class FalsePositivesController {
  
  // GET /api/v1/false-positives/summary
  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = extractFilters(req.query);
      const data = await falsePositivesService.getSummary(filters);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
  
  // GET /api/v1/false-positives/analysis
  async getAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = extractFilters(req.query);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const data = await falsePositivesService.getAnalysis(filters, page, limit);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
  
  // GET /api/v1/false-positives/by-entity
  async getByEntity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = extractFilters(req.query);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const data = await falsePositivesService.getByEntity(filters, page, limit);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
  
  // GET /api/v1/false-positives/recurring
  async getRecurring(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = extractFilters(req.query);
      const minOccurrences = parseInt(req.query.minOccurrences as string) || 5;
      const data = await falsePositivesService.getRecurring(filters, minOccurrences);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
  
  // GET /api/v1/false-positives/recommendations
  async getRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = extractFilters(req.query);
      const data = await falsePositivesService.getRecommendations(filters);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  }
}

export const falsePositivesController = new FalsePositivesController();
