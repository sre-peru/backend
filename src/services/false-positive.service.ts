/**
 * False Positive Analysis Service
 * @module services/false-positive.service
 * 
 * Analyzes Dynatrace problems to identify false positives using
 * multiple heuristics including duration, auto-remediation, 
 * recurrence patterns, and severity levels.
 */

import { Collection, Db } from 'mongodb';
import {
  Problem,
  SeverityLevel,
  ImpactLevel
} from '../types/problem.types';
import {
  FPClassification,
  FPReason,
  FP_REASON_LABELS,
  FPThresholds,
  DEFAULT_FP_THRESHOLDS,
  FPScoreResult,
  FPReasonDetail,
  ProblemWithFPAnalysis,
  EntityRecurrenceAnalysis,
  FPAnalyticsSummary,
  FPAnalysisRequest,
  FPAnalysisResponse,
  FPDashboardKPIs,
  FPWidgetData
} from '../types/false-positive.types';

// =============================================================================
// KEYWORDS FOR DETECTION
// =============================================================================

const AUTO_REMEDIATION_KEYWORDS = [
  'autoremediado', 'auto-remediado', 'autoremediation', 'self-remediation',
  'github actions', 'remediación automática', 'automatic remediation',
  'self healing', 'auto healing', 'automated fix', 'auto-fix',
  'workflow completed', 'remediation successful'
];

const AUTO_REMEDIATION_SUCCESS_KEYWORDS = [
  'exitosa', 'successful', 'completed successfully', 'fixed',
  'resolved automatically', 'auto-resolved', 'funcionó'
];

const MANUAL_CLOSE_KEYWORDS = [
  'manually closed', 'cerrado manualmente', 'closed by user',
  'cerrado por usuario', 'manual intervention', 'false positive',
  'falso positivo', 'not an issue', 'expected behavior'
];

const LOW_SEVERITY_LEVELS: SeverityLevel[] = [
  'RESOURCE_CONTENTION',
  'PERFORMANCE'
];

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class FalsePositiveService {
  private collection: Collection<Problem>;
  private thresholds: FPThresholds;

  constructor(db: Db, collectionName: string = 'problems') {
    this.collection = db.collection<Problem>(collectionName);
    this.thresholds = { ...DEFAULT_FP_THRESHOLDS };
  }

  /**
   * Update analysis thresholds
   */
  setThresholds(thresholds: Partial<FPThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): FPThresholds {
    return { ...this.thresholds };
  }

  /**
   * OPTIMIZED: Get summary using MongoDB aggregation (no memory loading)
   * This is much faster than runAnalysis for summary-only requests
   */
  async getSummaryFast(dateFrom?: string, dateTo?: string, managementZones?: string[]): Promise<FPAnalysisResponse> {
    const startTime = Date.now();
    
    // Build match stage
    const match: any = {};
    if (dateFrom || dateTo) {
      match.startTime = {};
      if (dateFrom) match.startTime.$gte = dateFrom;
      if (dateTo) match.startTime.$lte = dateTo;
    }
    if (managementZones?.length) {
      match['managementZones.name'] = { $in: managementZones };
    }

    // Aggregation pipeline to calculate all summary metrics in MongoDB
    const pipeline = [
      ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
      {
        $addFields: {
          // Calculate FP score directly in MongoDB
          fpScore: {
            $add: [
              // Duration score
              { $cond: [{ $lt: [{ $ifNull: ['$duration', 0] }, 5] }, 0.35, 
                { $cond: [{ $lt: [{ $ifNull: ['$duration', 0] }, 15] }, 0.20, 
                  { $cond: [{ $lt: [{ $ifNull: ['$duration', 0] }, 60] }, 0.10, 0] }] }] },
              // Auto-remediation score
              { $cond: [
                { $and: [
                  { $in: [{ $toLower: { $toString: { $ifNull: ['$Autoremediado', ''] } } }, ['si', 'sí', 'yes', 'true', '1']] },
                  { $in: [{ $toLower: { $toString: { $ifNull: ['$FuncionoAutoRemediacion', ''] } } }, ['si', 'sí', 'yes', 'true', '1']] }
                ]},
                0.25,
                { $cond: [
                  { $in: [{ $toLower: { $toString: { $ifNull: ['$Autoremediado', ''] } } }, ['si', 'sí', 'yes', 'true', '1']] },
                  0.10,
                  0
                ]}
              ]},
              // Low severity score
              { $cond: [{ $in: ['$severityLevel', ['RESOURCE_CONTENTION', 'PERFORMANCE']] }, 0.10, 0] },
              // No comments score
              { $cond: [{ $eq: [{ $ifNull: ['$recentComments.totalCount', 0] }, 0] }, 0.05, 0] }
            ]
          },
          // Duration category
          durationCategory: {
            $switch: {
              branches: [
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 5] }, then: '<5min' },
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 15] }, then: '5-15min' },
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 60] }, then: '15-60min' },
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 240] }, then: '1-4h' }
              ],
              default: '>4h'
            }
          },
          isAutoRemediated: {
            $in: [{ $toLower: { $toString: { $ifNull: ['$Autoremediado', ''] } } }, ['si', 'sí', 'yes', 'true', '1']]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalProblems: { $sum: 1 },
          // Classification counts
          falsePositives: { $sum: { $cond: [{ $gte: ['$fpScore', 0.6] }, 1, 0] } },
          truePositives: { $sum: { $cond: [{ $lt: ['$fpScore', 0.3] }, 1, 0] } },
          uncertain: { $sum: { $cond: [{ $and: [{ $gte: ['$fpScore', 0.3] }, { $lt: ['$fpScore', 0.6] }] }, 1, 0] } },
          // Rates
          autoRemediated: { $sum: { $cond: ['$isAutoRemediated', 1, 0] } },
          totalFPScore: { $sum: '$fpScore' },
          // Date range
          minDate: { $min: '$startTime' },
          maxDate: { $max: '$startTime' },
          // Duration distribution
          durationLt5: { $sum: { $cond: [{ $eq: ['$durationCategory', '<5min'] }, 1, 0] } },
          duration5to15: { $sum: { $cond: [{ $eq: ['$durationCategory', '5-15min'] }, 1, 0] } },
          duration15to60: { $sum: { $cond: [{ $eq: ['$durationCategory', '15-60min'] }, 1, 0] } },
          duration1to4h: { $sum: { $cond: [{ $eq: ['$durationCategory', '1-4h'] }, 1, 0] } },
          durationGt4h: { $sum: { $cond: [{ $eq: ['$durationCategory', '>4h'] }, 1, 0] } }
        }
      }
    ];

    const [mainResult] = await this.collection.aggregate(pipeline).toArray();

    // Get severity distribution in parallel
    const severityPipeline = [
      ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
      { $group: { _id: '$severityLevel', count: { $sum: 1 } } }
    ];
    const severityResults = await this.collection.aggregate(severityPipeline).toArray();
    const bySeverity: Record<string, number> = {};
    severityResults.forEach(item => {
      bySeverity[item._id || 'UNKNOWN'] = item.count;
    });

    // Build response
    const data = mainResult || {
      totalProblems: 0, falsePositives: 0, truePositives: 0, uncertain: 0,
      autoRemediated: 0, totalFPScore: 0, minDate: null, maxDate: null,
      durationLt5: 0, duration5to15: 0, duration15to60: 0, duration1to4h: 0, durationGt4h: 0
    };

    const executionTimeMs = Date.now() - startTime;

    const summary: FPAnalyticsSummary = {
      totalProblems: data.totalProblems,
      analyzedProblems: data.totalProblems,
      dateRange: { from: data.minDate || '', to: data.maxDate || '' },
      falsePositives: data.falsePositives,
      truePositives: data.truePositives,
      uncertain: data.uncertain,
      falsePositiveRate: data.totalProblems > 0 ? data.falsePositives / data.totalProblems : 0,
      autoRemediationRate: data.totalProblems > 0 ? data.autoRemediated / data.totalProblems : 0,
      avgFPScore: data.totalProblems > 0 ? data.totalFPScore / data.totalProblems : 0,
      byClassification: {
        [FPClassification.FALSE_POSITIVE]: data.falsePositives,
        [FPClassification.TRUE_POSITIVE]: data.truePositives,
        [FPClassification.UNCERTAIN]: data.uncertain
      },
      byDuration: {
        '<5min': data.durationLt5,
        '5-15min': data.duration5to15,
        '15-60min': data.duration15to60,
        '1-4h': data.duration1to4h,
        '>4h': data.durationGt4h
      },
      bySeverity: bySeverity as Record<SeverityLevel, number>,
      byImpact: {} as Record<ImpactLevel, number>,
      byEntityType: {},
      byManagementZone: {},
      byReason: {} as Record<FPReason, number>,
      dailyTrend: [],
      topRecurringEntities: [],
      topFalsePositiveTypes: []
    };

    // Generate recommendations based on summary
    const recommendations: string[] = [];
    if (summary.falsePositiveRate > 0.5) {
      recommendations.push(`⚠️ CRÍTICO: ${(summary.falsePositiveRate * 100).toFixed(1)}% de los problemas son posibles falsos positivos.`);
    } else if (summary.falsePositiveRate > 0.3) {
      recommendations.push(`⚠️ ALTO: ${(summary.falsePositiveRate * 100).toFixed(1)}% tasa de falsos positivos.`);
    }
    if (summary.autoRemediationRate > 0.5) {
      recommendations.push(`🤖 ${(summary.autoRemediationRate * 100).toFixed(1)}% de problemas auto-remediados.`);
    }
    const veryShortRate = data.durationLt5 / (data.totalProblems || 1);
    if (veryShortRate > 0.3) {
      recommendations.push(`⏱️ ${(veryShortRate * 100).toFixed(1)}% de problemas duran menos de 5 minutos.`);
    }

    return {
      success: true,
      summary,
      recommendations,
      generatedAt: new Date().toISOString(),
      executionTimeMs
    };
  }

  // ===========================================================================
  // CORE ANALYSIS METHODS
  // ===========================================================================


  /**
   * Calculate false positive score for a single problem
   */
  calculateFPScore(problem: Problem): FPScoreResult {
    let score = 0;
    const reasons: FPReasonDetail[] = [];

    // 1. Duration analysis
    const duration = problem.duration || 0;

    if (duration < this.thresholds.veryShortDurationMinutes) {
      const weight = 0.35;
      score += weight;
      reasons.push({
        reason: FPReason.VERY_SHORT_DURATION,
        label: FP_REASON_LABELS[FPReason.VERY_SHORT_DURATION],
        weight,
        details: `Duración: ${duration.toFixed(2)} min`
      });
    } else if (duration < this.thresholds.shortDurationMinutes) {
      const weight = 0.20;
      score += weight;
      reasons.push({
        reason: FPReason.SHORT_DURATION,
        label: FP_REASON_LABELS[FPReason.SHORT_DURATION],
        weight,
        details: `Duración: ${duration.toFixed(2)} min`
      });
    }

    // 2. Auto-remediation detection
    const autoRemediationStatus = this.detectAutoRemediation(problem);
    
    if (autoRemediationStatus.isAutoRemediated) {
      if (autoRemediationStatus.wasSuccessful) {
        const weight = 0.25;
        score += weight;
        reasons.push({
          reason: FPReason.AUTO_REMEDIATION_SUCCESS,
          label: FP_REASON_LABELS[FPReason.AUTO_REMEDIATION_SUCCESS],
          weight,
          details: 'Auto-remediación exitosa detectada'
        });
      } else {
        const weight = 0.15;
        score += weight;
        reasons.push({
          reason: FPReason.AUTO_REMEDIATED,
          label: FP_REASON_LABELS[FPReason.AUTO_REMEDIATED],
          weight,
          details: 'Auto-remediación intentada'
        });
      }
    }

    // 3. No comments (low investigation effort)
    const commentCount = problem.recentComments?.totalCount || 0;
    if (commentCount === 0) {
      const weight = 0.05;
      score += weight;
      reasons.push({
        reason: FPReason.NO_COMMENTS,
        label: FP_REASON_LABELS[FPReason.NO_COMMENTS],
        weight,
        details: 'Sin comentarios de investigación'
      });
    }

    // 4. Quick manual close
    if (this.wasQuickManualClose(problem)) {
      const weight = 0.15;
      score += weight;
      reasons.push({
        reason: FPReason.QUICK_MANUAL_CLOSE,
        label: FP_REASON_LABELS[FPReason.QUICK_MANUAL_CLOSE],
        weight,
        details: `Cerrado manualmente en ${duration.toFixed(2)} min`
      });
    }

    // 5. Low severity
    if (LOW_SEVERITY_LEVELS.includes(problem.severityLevel)) {
      const weight = 0.10;
      score += weight;
      reasons.push({
        reason: FPReason.LOW_SEVERITY,
        label: FP_REASON_LABELS[FPReason.LOW_SEVERITY],
        weight,
        details: `Severidad: ${problem.severityLevel}`
      });
    }

    // Clamp score between 0 and 1
    score = Math.min(1.0, Math.max(0.0, score));

    // Determine classification
    let classification: FPClassification;
    if (score >= this.thresholds.fpScoreThreshold) {
      classification = FPClassification.FALSE_POSITIVE;
    } else if (score >= this.thresholds.uncertainThreshold) {
      classification = FPClassification.UNCERTAIN;
    } else {
      classification = FPClassification.TRUE_POSITIVE;
    }

    // Calculate confidence (how sure we are about the classification)
    const confidence = this.calculateConfidence(score, reasons.length);

    return {
      score,
      classification,
      reasons,
      confidence
    };
  }

  /**
   * Analyze a problem and return enriched data
   */
  analyzeProblem(problem: Problem): ProblemWithFPAnalysis {
    const fpAnalysis = this.calculateFPScore(problem);
    return {
      ...problem,
      fpAnalysis
    };
  }

  /**
   * Batch analyze multiple problems
   */
  analyzeProblems(problems: Problem[]): ProblemWithFPAnalysis[] {
    return problems.map(p => this.analyzeProblem(p));
  }

  // ===========================================================================
  // DETECTION HELPERS
  // ===========================================================================

  private detectAutoRemediation(problem: Problem): {
    isAutoRemediated: boolean;
    wasSuccessful: boolean;
  } {
    // Check explicit fields (from your data structure)
    const problemAny = problem as any;
    if (problemAny.Autoremediado) {
      const isAutoRemediated = ['si', 'sí', 'yes', 'true', '1'].includes(
        String(problemAny.Autoremediado).toLowerCase()
      );
      const wasSuccessful = ['si', 'sí', 'yes', 'true', '1'].includes(
        String(problemAny.FuncionoAutoRemediacion || '').toLowerCase()
      );
      return { isAutoRemediated, wasSuccessful };
    }

    // Check comments for auto-remediation keywords
    const comments = problem.recentComments?.comments || [];
    let isAutoRemediated = false;
    let wasSuccessful = false;

    for (const comment of comments) {
      const content = (comment.content || '').toLowerCase();
      const context = (comment.context || '').toLowerCase();
      const combined = `${content} ${context}`;

      if (AUTO_REMEDIATION_KEYWORDS.some(kw => combined.includes(kw))) {
        isAutoRemediated = true;
        
        if (AUTO_REMEDIATION_SUCCESS_KEYWORDS.some(kw => combined.includes(kw))) {
          wasSuccessful = true;
        }
      }
    }

    // If auto-remediated and status is CLOSED, assume success
    if (isAutoRemediated && problem.status === 'CLOSED' && !wasSuccessful) {
      wasSuccessful = true;
    }

    return { isAutoRemediated, wasSuccessful };
  }

  private wasQuickManualClose(problem: Problem): boolean {
    if (problem.duration >= 10) return false;

    const comments = problem.recentComments?.comments || [];
    
    for (const comment of comments) {
      const content = (comment.content || '').toLowerCase();
      const context = (comment.context || '').toLowerCase();
      const combined = `${content} ${context}`;

      if (MANUAL_CLOSE_KEYWORDS.some(kw => combined.includes(kw))) {
        return true;
      }
    }

    // Check evidence details for manual close
    const details = problem.evidenceDetails?.details || [];
    for (const detail of details) {
      const props = detail.data?.properties || [];
      for (const prop of props) {
        if (MANUAL_CLOSE_KEYWORDS.some(kw => 
          String(prop.value || '').toLowerCase().includes(kw)
        )) {
          return true;
        }
      }
    }

    return false;
  }

  private calculateConfidence(score: number, reasonCount: number): number {
    // Higher confidence when:
    // - Score is far from thresholds (clear classification)
    // - Multiple reasons support the classification

    const distanceFromThreshold = Math.min(
      Math.abs(score - this.thresholds.fpScoreThreshold),
      Math.abs(score - this.thresholds.uncertainThreshold)
    );

    // Base confidence from distance
    let confidence = Math.min(0.5 + distanceFromThreshold, 0.8);

    // Boost for multiple supporting reasons
    confidence += Math.min(reasonCount * 0.05, 0.2);

    return Math.min(1.0, confidence);
  }

  // ===========================================================================
  // ENTITY RECURRENCE ANALYSIS
  // ===========================================================================

  /**
   * Analyze recurrence patterns for all entities
   */
  async analyzeEntityRecurrence(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<EntityRecurrenceAnalysis[]> {
    const matchStage: any = {};
    
    if (dateFrom || dateTo) {
      matchStage.startTime = {};
      if (dateFrom) matchStage.startTime.$gte = dateFrom.toISOString();
      if (dateTo) matchStage.startTime.$lte = dateTo.toISOString();
    }

    const pipeline = [
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      {
        $unwind: {
          path: '$affectedEntities',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $group: {
          _id: '$affectedEntities.entityId.id',
          entityName: { $first: '$affectedEntities.name' },
          entityType: { $first: '$affectedEntities.entityId.type' },
          totalProblems: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
          minDuration: { $min: '$duration' },
          maxDuration: { $max: '$duration' },
          problems: {
            $push: {
              problemId: '$problemId',
              displayId: '$displayId',
              title: '$title',
              startTime: '$startTime',
              duration: '$duration',
              status: '$status',
              Autoremediado: '$Autoremediado'
            }
          }
        }
      },
      {
        $match: {
          totalProblems: { $gte: 2 } // At least 2 problems
        }
      },
      {
        $sort: { totalProblems: -1 }
      },
      {
        $limit: 50
      }
    ];

    const results = await this.collection.aggregate(pipeline).toArray();

    return results.map((entity: any) => {
      const autoRemediatedCount = entity.problems.filter((p: any) =>
        ['si', 'sí', 'yes', 'true', '1'].includes(
          String(p.Autoremediado || '').toLowerCase()
        )
      ).length;

      // Calculate FP rate by analyzing each problem
      const analyzedProblems = entity.problems.map((p: any) => ({
        ...p,
        duration: p.duration || 0
      }));

      let fpCount = 0;
      for (const p of analyzedProblems) {
        const mockProblem = {
          duration: p.duration,
          severityLevel: 'RESOURCE_CONTENTION' as SeverityLevel,
          status: p.status,
          recentComments: { totalCount: 0, comments: [] }
        } as unknown as Problem;
        
        (mockProblem as any).Autoremediado = p.Autoremediado;
        
        const score = this.calculateFPScore(mockProblem);
        if (score.classification === FPClassification.FALSE_POSITIVE) {
          fpCount++;
        }
      }

      const falsePositiveRate = entity.totalProblems > 0 
        ? fpCount / entity.totalProblems 
        : 0;

      // Problem type distribution
      const problemTypes: Record<string, number> = {};
      for (const p of entity.problems) {
        problemTypes[p.title] = (problemTypes[p.title] || 0) + 1;
      }

      // Recurrence score (normalized)
      const recurrenceScore = Math.min(
        1.0,
        entity.totalProblems / this.thresholds.highRecurrenceCount
      );

      // Generate recommendation
      let recommendation: string | undefined;
      if (falsePositiveRate > 0.7) {
        recommendation = 'Alta tasa de FP. Considere ajustar umbrales de alertas para esta entidad.';
      } else if (entity.totalProblems > 10 && autoRemediatedCount / entity.totalProblems > 0.8) {
        recommendation = 'Problemas frecuentes auto-remediados. Considere aumentar umbrales de detección.';
      } else if (entity.avgDuration < 5) {
        recommendation = 'Problemas muy transitorios. Considere añadir delay antes de alertar.';
      }

      return {
        entityId: entity._id,
        entityName: entity.entityName || 'Unknown',
        entityType: entity.entityType || 'Unknown',
        totalProblems: entity.totalProblems,
        avgDurationMinutes: entity.avgDuration || 0,
        minDurationMinutes: entity.minDuration || 0,
        maxDurationMinutes: entity.maxDuration || 0,
        autoRemediationRate: entity.totalProblems > 0 
          ? autoRemediatedCount / entity.totalProblems 
          : 0,
        falsePositiveRate,
        recurrenceScore,
        problemTypes,
        recentProblems: entity.problems
          .slice(0, 5)
          .map((p: any) => ({
            problemId: p.problemId,
            displayId: p.displayId,
            title: p.title,
            startTime: p.startTime,
            duration: p.duration || 0,
            fpScore: 0 // Would need full problem to calculate
          })),
        recommendation
      };
    });
  }

  // ===========================================================================
  // FULL ANALYSIS
  // ===========================================================================

  /**
   * Run complete false positive analysis
   */
  async runAnalysis(request: FPAnalysisRequest = {}): Promise<FPAnalysisResponse> {
    const startTime = Date.now();

    // Apply custom thresholds if provided
    if (request.thresholds) {
      this.setThresholds(request.thresholds);
    }

    // Build query
    const query: any = {};
    
    if (request.dateFrom || request.dateTo) {
      query.startTime = {};
      if (request.dateFrom) query.startTime.$gte = request.dateFrom;
      if (request.dateTo) query.startTime.$lte = request.dateTo;
    }

    if (request.managementZones?.length) {
      query['managementZones.name'] = { $in: request.managementZones };
    }

    if (request.severityLevels?.length) {
      query.severityLevel = { $in: request.severityLevels };
    }

    if (request.impactLevels?.length) {
      query.impactLevel = { $in: request.impactLevels };
    }

    if (request.entityTypes?.length) {
      query['affectedEntities.entityId.type'] = { $in: request.entityTypes };
    }

    // Fetch problems - DEFAULT LIMIT to 10000 for comprehensive analysis
    const limit = request.limit || 10000;
    const problems = await this.collection
      .find(query)
      .sort({ startTime: -1 })  // Most recent first
      .limit(limit)
      .toArray();

    // Analyze all problems
    const analyzedProblems = this.analyzeProblems(problems);

    // Calculate summary statistics
    const summary = this.calculateSummary(analyzedProblems);

    // Skip entity recurrence analysis for faster response (can be fetched separately)
    // Only do it if explicitly requested or if limit is high enough
    if (limit >= 1000) {
      const dateFrom = request.dateFrom ? new Date(request.dateFrom) : undefined;
      const dateTo = request.dateTo ? new Date(request.dateTo) : undefined;
      summary.topRecurringEntities = await this.analyzeEntityRecurrence(dateFrom, dateTo);
    } else {
      summary.topRecurringEntities = [];
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, analyzedProblems);

    const executionTimeMs = Date.now() - startTime;

    return {
      success: true,
      summary,
      problems: request.includeDetails ? analyzedProblems : undefined,
      recommendations,
      generatedAt: new Date().toISOString(),
      executionTimeMs
    };
  }

  // ===========================================================================
  // SUMMARY CALCULATION
  // ===========================================================================

  private calculateSummary(problems: ProblemWithFPAnalysis[]): FPAnalyticsSummary {
    const total = problems.length;

    if (total === 0) {
      return this.getEmptySummary();
    }

    // Classification counts
    const byClassification: Record<FPClassification, number> = {
      [FPClassification.FALSE_POSITIVE]: 0,
      [FPClassification.TRUE_POSITIVE]: 0,
      [FPClassification.UNCERTAIN]: 0
    };

    // Duration distribution
    const byDuration: Record<string, number> = {
      '<5min': 0,
      '5-15min': 0,
      '15-60min': 0,
      '1-4h': 0,
      '>4h': 0
    };

    // Other distributions
    const bySeverity: Record<string, number> = {};
    const byImpact: Record<string, number> = {};
    const byEntityType: Record<string, number> = {};
    const byManagementZone: Record<string, number> = {};
    const byReason: Record<string, number> = {};

    // Daily trend
    const dailyData: Record<string, { total: number; fp: number; tp: number }> = {};

    // Top FP types
    const fpTypeData: Record<string, { count: number; totalScore: number }> = {};

    let totalFPScore = 0;
    let autoRemediatedCount = 0;

    // Process each problem
    for (const problem of problems) {
      const analysis = problem.fpAnalysis;

      // Classification
      byClassification[analysis.classification]++;
      totalFPScore += analysis.score;

      // Duration category
      const duration = problem.duration || 0;
      if (duration < 5) byDuration['<5min']++;
      else if (duration < 15) byDuration['5-15min']++;
      else if (duration < 60) byDuration['15-60min']++;
      else if (duration < 240) byDuration['1-4h']++;
      else byDuration['>4h']++;

      // Severity
      bySeverity[problem.severityLevel] = (bySeverity[problem.severityLevel] || 0) + 1;

      // Impact
      byImpact[problem.impactLevel] = (byImpact[problem.impactLevel] || 0) + 1;

      // Entity types
      for (const entity of problem.affectedEntities || []) {
        const type = entity.entityId?.type || 'Unknown';
        byEntityType[type] = (byEntityType[type] || 0) + 1;
      }

      // Management zones
      for (const zone of problem.managementZones || []) {
        byManagementZone[zone.name] = (byManagementZone[zone.name] || 0) + 1;
      }

      // Reasons
      for (const reason of analysis.reasons) {
        byReason[reason.reason] = (byReason[reason.reason] || 0) + 1;
      }

      // Auto-remediation
      if (analysis.reasons.some(r => 
        r.reason === FPReason.AUTO_REMEDIATED || 
        r.reason === FPReason.AUTO_REMEDIATION_SUCCESS
      )) {
        autoRemediatedCount++;
      }

      // Daily trend
      const date = problem.startTime?.substring(0, 10) || 'unknown';
      if (!dailyData[date]) {
        dailyData[date] = { total: 0, fp: 0, tp: 0 };
      }
      dailyData[date].total++;
      if (analysis.classification === FPClassification.FALSE_POSITIVE) {
        dailyData[date].fp++;
      } else if (analysis.classification === FPClassification.TRUE_POSITIVE) {
        dailyData[date].tp++;
      }

      // FP types
      if (analysis.classification === FPClassification.FALSE_POSITIVE) {
        if (!fpTypeData[problem.title]) {
          fpTypeData[problem.title] = { count: 0, totalScore: 0 };
        }
        fpTypeData[problem.title].count++;
        fpTypeData[problem.title].totalScore += analysis.score;
      }
    }

    // Build daily trend array
    const dailyTrend = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        total: data.total,
        falsePositives: data.fp,
        truePositives: data.tp,
        fpRate: data.total > 0 ? data.fp / data.total : 0
      }));

    // Build top FP types
    const topFalsePositiveTypes = Object.entries(fpTypeData)
      .map(([title, data]) => ({
        title,
        count: data.count,
        avgFPScore: data.count > 0 ? data.totalScore / data.count : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Date range
    const dates = problems
      .map(p => p.startTime)
      .filter(Boolean)
      .sort();

    return {
      totalProblems: total,
      analyzedProblems: total,
      dateRange: {
        from: dates[0] || '',
        to: dates[dates.length - 1] || ''
      },
      falsePositives: byClassification[FPClassification.FALSE_POSITIVE],
      truePositives: byClassification[FPClassification.TRUE_POSITIVE],
      uncertain: byClassification[FPClassification.UNCERTAIN],
      falsePositiveRate: byClassification[FPClassification.FALSE_POSITIVE] / total,
      autoRemediationRate: autoRemediatedCount / total,
      avgFPScore: totalFPScore / total,
      byClassification,
      byDuration,
      bySeverity: bySeverity as Record<SeverityLevel, number>,
      byImpact: byImpact as Record<ImpactLevel, number>,
      byEntityType,
      byManagementZone,
      byReason: byReason as Record<FPReason, number>,
      dailyTrend,
      topRecurringEntities: [], // Filled separately
      topFalsePositiveTypes
    };
  }

  private getEmptySummary(): FPAnalyticsSummary {
    return {
      totalProblems: 0,
      analyzedProblems: 0,
      dateRange: { from: '', to: '' },
      falsePositives: 0,
      truePositives: 0,
      uncertain: 0,
      falsePositiveRate: 0,
      autoRemediationRate: 0,
      avgFPScore: 0,
      byClassification: {
        [FPClassification.FALSE_POSITIVE]: 0,
        [FPClassification.TRUE_POSITIVE]: 0,
        [FPClassification.UNCERTAIN]: 0
      },
      byDuration: {},
      bySeverity: {} as Record<SeverityLevel, number>,
      byImpact: {} as Record<ImpactLevel, number>,
      byEntityType: {},
      byManagementZone: {},
      byReason: {} as Record<FPReason, number>,
      dailyTrend: [],
      topRecurringEntities: [],
      topFalsePositiveTypes: []
    };
  }

  // ===========================================================================
  // RECOMMENDATIONS
  // ===========================================================================

  private generateRecommendations(
    summary: FPAnalyticsSummary,
    _problems: ProblemWithFPAnalysis[]
  ): string[] {
    const recommendations: string[] = [];

    // FP rate recommendation
    if (summary.falsePositiveRate > 0.5) {
      recommendations.push(
        `⚠️ CRÍTICO: ${(summary.falsePositiveRate * 100).toFixed(1)}% de los problemas son posibles falsos positivos. ` +
        'Se recomienda revisar urgentemente los umbrales de alertas en Dynatrace.'
      );
    } else if (summary.falsePositiveRate > 0.3) {
      recommendations.push(
        `⚠️ ALTO: ${(summary.falsePositiveRate * 100).toFixed(1)}% tasa de falsos positivos. ` +
        'Considere ajustar los umbrales de detección.'
      );
    } else if (summary.falsePositiveRate > 0.1) {
      recommendations.push(
        `ℹ️ MODERADO: ${(summary.falsePositiveRate * 100).toFixed(1)}% tasa de falsos positivos. ` +
        'Algunos ajustes podrían mejorar la precisión.'
      );
    } else {
      recommendations.push(
        `✅ BUENO: Solo ${(summary.falsePositiveRate * 100).toFixed(1)}% de falsos positivos detectados.`
      );
    }

    // Auto-remediation recommendation
    if (summary.autoRemediationRate > 0.5) {
      recommendations.push(
        `🤖 ${(summary.autoRemediationRate * 100).toFixed(1)}% de problemas auto-remediados. ` +
        'Considere aumentar umbrales para reducir alertas de problemas transitorios.'
      );
    }

    // Duration recommendation
    const veryShortCount = summary.byDuration['<5min'] || 0;
    const veryShortRate = summary.totalProblems > 0 
      ? veryShortCount / summary.totalProblems 
      : 0;
    
    if (veryShortRate > 0.3) {
      recommendations.push(
        `⏱️ ${(veryShortRate * 100).toFixed(1)}% de problemas duran menos de 5 minutos. ` +
        'Considere añadir delays antes de generar alertas para problemas transitorios.'
      );
    }

    // Recurring entities recommendation
    const highRecurrence = summary.topRecurringEntities?.filter(
      e => e.totalProblems >= this.thresholds.highRecurrenceCount
    ) || [];

    if (highRecurrence.length > 0) {
      const top3Names = highRecurrence
        .slice(0, 3)
        .map(e => e.entityName.substring(0, 40))
        .join(', ');
      
      recommendations.push(
        `🔄 ${highRecurrence.length} entidades con alta recurrencia. ` +
        `Top 3: ${top3Names}. Revisar configuración de estas entidades.`
      );
    }

    // Severity-specific recommendations
    const resourceContentionCount = summary.bySeverity['RESOURCE_CONTENTION'] || 0;
    if (resourceContentionCount > summary.totalProblems * 0.4) {
      recommendations.push(
        `📊 ${((resourceContentionCount / summary.totalProblems) * 100).toFixed(1)}% son problemas de RESOURCE_CONTENTION. ` +
        'Considere revisar los umbrales de recursos o capacidad de infraestructura.'
      );
    }

    return recommendations;
  }

  // ===========================================================================
  // DASHBOARD DATA
  // ===========================================================================

  /**
   * Get dashboard KPIs
   */
  async getDashboardKPIs(
    dateFrom?: string,
    dateTo?: string,
    _previousPeriodDays: number = 30
  ): Promise<FPDashboardKPIs> {
    // Current period analysis
    const currentAnalysis = await this.runAnalysis({
      dateFrom,
      dateTo,
      includeDetails: false
    });

    // Previous period for comparison
    let fpRateChange = 0;
    if (dateFrom && dateTo) {
      const currentFrom = new Date(dateFrom);
      const currentTo = new Date(dateTo);
      const periodMs = currentTo.getTime() - currentFrom.getTime();
      
      const previousTo = new Date(currentFrom.getTime() - 1);
      const previousFrom = new Date(previousTo.getTime() - periodMs);

      const previousAnalysis = await this.runAnalysis({
        dateFrom: previousFrom.toISOString(),
        dateTo: previousTo.toISOString(),
        includeDetails: false
      });

      if (previousAnalysis.summary.falsePositiveRate > 0) {
        fpRateChange = (
          (currentAnalysis.summary.falsePositiveRate - previousAnalysis.summary.falsePositiveRate) /
          previousAnalysis.summary.falsePositiveRate
        ) * 100;
      }
    }

    const summary = currentAnalysis.summary;
    const topEntity = summary.topRecurringEntities?.[0];

    // Alert health score (100 = no FPs, 0 = all FPs)
    const alertHealthScore = Math.round((1 - summary.falsePositiveRate) * 100);

    return {
      totalProblems: summary.totalProblems,
      falsePositiveRate: summary.falsePositiveRate,
      falsePositiveRateChange: fpRateChange,
      avgResolutionTime: this.calculateAvgResolutionTime(summary),
      autoRemediationRate: summary.autoRemediationRate,
      topRecurringEntity: topEntity ? {
        name: topEntity.entityName,
        count: topEntity.totalProblems
      } : null,
      alertHealthScore
    };
  }

  /**
   * Get data for dashboard widgets
   */
  async getWidgetData(
    dateFrom?: string,
    dateTo?: string
  ): Promise<FPWidgetData> {
    const analysis = await this.runAnalysis({
      dateFrom,
      dateTo,
      includeDetails: false
    });

    const summary = analysis.summary;
    const kpis = await this.getDashboardKPIs(dateFrom, dateTo);

    // Classification pie chart
    const classificationPieChart = [
      { name: 'Falsos Positivos', value: summary.falsePositives, color: '#ff6b6b' },
      { name: 'Verdaderos Positivos', value: summary.truePositives, color: '#51cf66' },
      { name: 'Inciertos', value: summary.uncertain, color: '#ffd43b' }
    ];

    // Duration histogram
    const durationHistogram = Object.entries(summary.byDuration).map(([range, count]) => {
      // Calculate FP rate for this duration range
      const fpRate = summary.totalProblems > 0 
        ? (range === '<5min' ? 0.7 : range === '5-15min' ? 0.4 : 0.2) // Approximation
        : 0;
      
      return { range, count, fpRate };
    });

    // FP rate trend
    const fpRateTrend = summary.dailyTrend.map(day => ({
      timestamp: day.date,
      value: day.fpRate,
      label: `${(day.fpRate * 100).toFixed(1)}%`
    }));

    // Severity matrix
    const severityMatrix = Object.entries(summary.bySeverity).map(([severity, total]) => ({
      severity: severity as SeverityLevel,
      total,
      fp: Math.round(total * summary.falsePositiveRate), // Approximation
      tp: Math.round(total * (1 - summary.falsePositiveRate - 0.1)),
      uncertain: Math.round(total * 0.1)
    }));

    return {
      kpis,
      classificationPieChart,
      durationHistogram,
      fpRateTrend,
      severityMatrix
    };
  }

  private calculateAvgResolutionTime(summary: FPAnalyticsSummary): number {
    // Weighted average based on duration distribution
    const weights: Record<string, number> = {
      '<5min': 2.5,
      '5-15min': 10,
      '15-60min': 37.5,
      '1-4h': 150,
      '>4h': 360
    };

    let totalWeight = 0;
    let totalDuration = 0;

    for (const [range, count] of Object.entries(summary.byDuration)) {
      const avgDuration = weights[range] || 30;
      totalDuration += avgDuration * count;
      totalWeight += count;
    }

    return totalWeight > 0 ? totalDuration / totalWeight : 0;
  }
}

export default FalsePositiveService;
