/**
 * Type definitions for False Positive Analysis
 * @module types/false-positive.types
 */

import { Problem, ImpactLevel, SeverityLevel } from './problem.types';

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

export enum FPClassification {
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  TRUE_POSITIVE = 'TRUE_POSITIVE',
  UNCERTAIN = 'UNCERTAIN'
}

export enum FPReason {
  VERY_SHORT_DURATION = 'VERY_SHORT_DURATION',
  SHORT_DURATION = 'SHORT_DURATION',
  AUTO_REMEDIATED = 'AUTO_REMEDIATED',
  AUTO_REMEDIATION_SUCCESS = 'AUTO_REMEDIATION_SUCCESS',
  NO_COMMENTS = 'NO_COMMENTS',
  QUICK_MANUAL_CLOSE = 'QUICK_MANUAL_CLOSE',
  LOW_SEVERITY = 'LOW_SEVERITY',
  RESOURCE_CONTENTION = 'RESOURCE_CONTENTION',
  RECURRING_PATTERN = 'RECURRING_PATTERN',
  SPIKE_PATTERN = 'SPIKE_PATTERN'
}

export const FP_REASON_LABELS: Record<FPReason, string> = {
  [FPReason.VERY_SHORT_DURATION]: 'Duración muy corta (<5 min)',
  [FPReason.SHORT_DURATION]: 'Duración corta (5-15 min)',
  [FPReason.AUTO_REMEDIATED]: 'Auto-remediado',
  [FPReason.AUTO_REMEDIATION_SUCCESS]: 'Auto-remediación exitosa',
  [FPReason.NO_COMMENTS]: 'Sin comentarios/investigación',
  [FPReason.QUICK_MANUAL_CLOSE]: 'Cierre manual rápido',
  [FPReason.LOW_SEVERITY]: 'Severidad baja',
  [FPReason.RESOURCE_CONTENTION]: 'Contención de recursos',
  [FPReason.RECURRING_PATTERN]: 'Patrón recurrente',
  [FPReason.SPIKE_PATTERN]: 'Spike transitorio'
};

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface FPThresholds {
  /** Duration in minutes to consider "very short" */
  veryShortDurationMinutes: number;
  /** Duration in minutes to consider "short" */
  shortDurationMinutes: number;
  /** Duration in minutes to consider "medium" */
  mediumDurationMinutes: number;
  /** Minimum occurrences to consider "high recurrence" */
  highRecurrenceCount: number;
  /** Days to look back for recurrence analysis */
  recurrenceWindowDays: number;
  /** FP score threshold (0-1) to classify as false positive */
  fpScoreThreshold: number;
  /** FP score threshold for uncertain classification */
  uncertainThreshold: number;
}

export const DEFAULT_FP_THRESHOLDS: FPThresholds = {
  veryShortDurationMinutes: 5,
  shortDurationMinutes: 15,
  mediumDurationMinutes: 60,
  highRecurrenceCount: 5,
  recurrenceWindowDays: 30,
  fpScoreThreshold: 0.6,
  uncertainThreshold: 0.3
};

// =============================================================================
// SCORE CALCULATION
// =============================================================================

export interface FPScoreWeight {
  reason: FPReason;
  weight: number;
  condition: string;
}

export const DEFAULT_SCORE_WEIGHTS: FPScoreWeight[] = [
  { reason: FPReason.VERY_SHORT_DURATION, weight: 0.35, condition: 'duration < 5 min' },
  { reason: FPReason.SHORT_DURATION, weight: 0.20, condition: 'duration 5-15 min' },
  { reason: FPReason.AUTO_REMEDIATION_SUCCESS, weight: 0.25, condition: 'auto-remediation successful' },
  { reason: FPReason.AUTO_REMEDIATED, weight: 0.15, condition: 'auto-remediation attempted' },
  { reason: FPReason.QUICK_MANUAL_CLOSE, weight: 0.15, condition: 'manually closed < 10 min' },
  { reason: FPReason.LOW_SEVERITY, weight: 0.10, condition: 'severity is RESOURCE_CONTENTION/PERFORMANCE' },
  { reason: FPReason.NO_COMMENTS, weight: 0.05, condition: 'no comments on problem' },
  { reason: FPReason.RECURRING_PATTERN, weight: 0.10, condition: 'entity has 5+ similar problems' }
];

// =============================================================================
// ANALYSIS RESULTS
// =============================================================================

export interface FPScoreResult {
  score: number;
  classification: FPClassification;
  reasons: FPReasonDetail[];
  confidence: number;
}

export interface FPReasonDetail {
  reason: FPReason;
  label: string;
  weight: number;
  details?: string;
}

export interface ProblemWithFPAnalysis extends Problem {
  fpAnalysis: FPScoreResult;
}

// =============================================================================
// ENTITY ANALYSIS
// =============================================================================

export interface EntityRecurrenceAnalysis {
  entityId: string;
  entityName: string;
  entityType: string;
  totalProblems: number;
  avgDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  autoRemediationRate: number;
  falsePositiveRate: number;
  recurrenceScore: number;
  problemTypes: Record<string, number>;
  recentProblems: Array<{
    problemId: string;
    displayId: string;
    title: string;
    startTime: string;
    duration: number;
    fpScore: number;
  }>;
  recommendation?: string;
}

// =============================================================================
// AGGREGATED ANALYTICS
// =============================================================================

export interface FPAnalyticsSummary {
  totalProblems: number;
  analyzedProblems: number;
  dateRange: {
    from: string;
    to: string;
  };
  
  // Classifications
  falsePositives: number;
  truePositives: number;
  uncertain: number;
  
  // Rates
  falsePositiveRate: number;
  autoRemediationRate: number;
  avgFPScore: number;
  
  // Distributions
  byClassification: Record<FPClassification, number>;
  byDuration: Record<string, number>;
  bySeverity: Record<SeverityLevel, number>;
  byImpact: Record<ImpactLevel, number>;
  byEntityType: Record<string, number>;
  byManagementZone: Record<string, number>;
  byReason: Record<FPReason, number>;
  
  // Trends
  dailyTrend: Array<{
    date: string;
    total: number;
    falsePositives: number;
    truePositives: number;
    fpRate: number;
  }>;
  
  // Top offenders
  topRecurringEntities: EntityRecurrenceAnalysis[];
  topFalsePositiveTypes: Array<{
    title: string;
    count: number;
    avgFPScore: number;
  }>;
}

// =============================================================================
// API REQUEST/RESPONSE
// =============================================================================

export interface FPAnalysisRequest {
  /** Filter problems by date range */
  dateFrom?: string;
  dateTo?: string;
  /** Filter by management zones */
  managementZones?: string[];
  /** Filter by severity levels */
  severityLevels?: SeverityLevel[];
  /** Filter by impact levels */
  impactLevels?: ImpactLevel[];
  /** Filter by entity types */
  entityTypes?: string[];
  /** Custom thresholds */
  thresholds?: Partial<FPThresholds>;
  /** Include detailed problem list */
  includeDetails?: boolean;
  /** Limit number of problems to analyze */
  limit?: number;
}

export interface FPAnalysisResponse {
  success: boolean;
  summary: FPAnalyticsSummary;
  problems?: ProblemWithFPAnalysis[];
  recommendations: string[];
  generatedAt: string;
  executionTimeMs: number;
}

export interface FPProblemListResponse {
  problems: ProblemWithFPAnalysis[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    classification?: FPClassification;
    minScore?: number;
    maxScore?: number;
  };
}

// =============================================================================
// DASHBOARD WIDGETS
// =============================================================================

export interface FPDashboardKPIs {
  totalProblems: number;
  falsePositiveRate: number;
  falsePositiveRateChange: number; // vs previous period
  avgResolutionTime: number;
  autoRemediationRate: number;
  topRecurringEntity: {
    name: string;
    count: number;
  } | null;
  alertHealthScore: number; // 0-100, higher is better (fewer FPs)
}

export interface FPTrendPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface FPWidgetData {
  kpis: FPDashboardKPIs;
  classificationPieChart: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  durationHistogram: Array<{
    range: string;
    count: number;
    fpRate: number;
  }>;
  fpRateTrend: FPTrendPoint[];
  severityMatrix: Array<{
    severity: SeverityLevel;
    total: number;
    fp: number;
    tp: number;
    uncertain: number;
  }>;
}
