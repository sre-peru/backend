/**
 * Analytics Controller
 */
import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { sendSuccess } from '../utils/response.utils';
import { parseFilters } from '../utils/filter.utils';

// Lazy initialization to ensure database is connected first
let analyticsService: AnalyticsService;
const getAnalyticsService = () => {
  if (!analyticsService) {
    analyticsService = new AnalyticsService();
  }
  return analyticsService;
};

/**
 * Get dashboard KPIs
 */
export const getKPIs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const kpis = await getAnalyticsService().getKPIs(filters);
    sendSuccess(res, kpis);
  } catch (error) {
    next(error);
  }
};

/**
 * Get time series data
 */
export const getTimeSeries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { granularity = 'day', ...queryFilters } = req.query;
    const filters = parseFilters(queryFilters);
    const data = await getAnalyticsService().getTimeSeries(granularity as 'day' | 'week' | 'month', filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get impact vs severity matrix
 */
export const getImpactSeverityMatrix = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const data = await getAnalyticsService().getImpactSeverityMatrix(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get top entities
 */
export const getTopEntities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit = 10, ...queryFilters } = req.query;
    const filters = parseFilters(queryFilters);
    const data = await getAnalyticsService().getTopEntities(Number(limit), filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get management zones analysis
 */
export const getManagementZones = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const data = await getAnalyticsService().getManagementZones(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get remediation funnel
 */
export const getRemediationFunnel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const data = await getAnalyticsService().getRemediationFunnel(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get duration distribution
 */
export const getDurationDistribution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const data = await getAnalyticsService().getDurationDistribution(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get evidence types
 */
export const getEvidenceTypes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const data = await getAnalyticsService().getEvidenceTypes(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get root cause analysis (treemap)
 */
export const getRootCauseAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const data = await getAnalyticsService().getRootCauseAnalysis(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

/**
 * Get root cause distribution (pie chart)
 */
export const getRootCauseDistribution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const data = await getAnalyticsService().getRootCauseDistribution(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};
