/**
 * False Positive Scoring Utilities
 * @module utils/fp-scoring.utils
 * 
 * Standalone utility functions for FP score calculation.
 * Can be used independently of the service for lightweight analysis.
 */

import { Problem, SeverityLevel } from '../types/problem.types';
import {
  FPClassification,
  FPReason,
  FP_REASON_LABELS,
  FPThresholds,
  DEFAULT_FP_THRESHOLDS,
  FPScoreResult,
  FPReasonDetail
} from '../types/false-positive.types';

// =============================================================================
// CONFIGURATION
// =============================================================================

const LOW_SEVERITY_LEVELS: SeverityLevel[] = [
  'RESOURCE_CONTENTION',
  'PERFORMANCE'
];

const AUTO_REMEDIATION_VALUES = ['si', 'sí', 'yes', 'true', '1'];

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Calculate false positive score for a problem
 * @param problem - The problem to analyze
 * @param thresholds - Optional custom thresholds
 * @returns FP score result with classification and reasons
 */
export function calculateFPScore(
  problem: Problem,
  thresholds: FPThresholds = DEFAULT_FP_THRESHOLDS
): FPScoreResult {
  let score = 0;
  const reasons: FPReasonDetail[] = [];

  const duration = problem.duration || 0;

  // 1. Duration analysis
  if (duration < thresholds.veryShortDurationMinutes) {
    const weight = 0.35;
    score += weight;
    reasons.push({
      reason: FPReason.VERY_SHORT_DURATION,
      label: FP_REASON_LABELS[FPReason.VERY_SHORT_DURATION],
      weight,
      details: `Duración: ${duration.toFixed(2)} min`
    });
  } else if (duration < thresholds.shortDurationMinutes) {
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
  const { isAutoRemediated, wasSuccessful } = detectAutoRemediation(problem);
  
  if (isAutoRemediated) {
    if (wasSuccessful) {
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
  if (duration < 10 && commentCount > 0) {
    const comments = problem.recentComments?.comments || [];
    const hasManualCloseKeyword = comments.some(c => {
      const content = (c.content || '').toLowerCase();
      return ['false positive', 'falso positivo', 'not an issue', 'cerrado manualmente']
        .some(kw => content.includes(kw));
    });
    
    if (hasManualCloseKeyword) {
      const weight = 0.15;
      score += weight;
      reasons.push({
        reason: FPReason.QUICK_MANUAL_CLOSE,
        label: FP_REASON_LABELS[FPReason.QUICK_MANUAL_CLOSE],
        weight,
        details: `Cerrado manualmente en ${duration.toFixed(2)} min`
      });
    }
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
  const classification = classifyByScore(score, thresholds);

  // Calculate confidence
  const confidence = calculateConfidence(score, reasons.length, thresholds);

  return {
    score,
    classification,
    reasons,
    confidence
  };
}

/**
 * Classify a problem based on its FP score
 */
export function classifyByScore(
  score: number,
  thresholds: FPThresholds = DEFAULT_FP_THRESHOLDS
): FPClassification {
  if (score >= thresholds.fpScoreThreshold) {
    return FPClassification.FALSE_POSITIVE;
  } else if (score >= thresholds.uncertainThreshold) {
    return FPClassification.UNCERTAIN;
  } else {
    return FPClassification.TRUE_POSITIVE;
  }
}

/**
 * Detect if a problem was auto-remediated
 */
export function detectAutoRemediation(problem: Problem): {
  isAutoRemediated: boolean;
  wasSuccessful: boolean;
} {
  const problemAny = problem as any;
  
  // Check explicit fields
  if (problemAny.Autoremediado !== undefined) {
    const isAutoRemediated = AUTO_REMEDIATION_VALUES.includes(
      String(problemAny.Autoremediado).toLowerCase()
    );
    const wasSuccessful = AUTO_REMEDIATION_VALUES.includes(
      String(problemAny.FuncionoAutoRemediacion || '').toLowerCase()
    );
    return { isAutoRemediated, wasSuccessful };
  }

  // Check comments for keywords
  const comments = problem.recentComments?.comments || [];
  const autoRemediationKeywords = [
    'autoremediado', 'auto-remediado', 'github actions', 
    'self-healing', 'auto-fix', 'automated fix'
  ];
  const successKeywords = ['exitosa', 'successful', 'completed', 'fixed'];

  let isAutoRemediated = false;
  let wasSuccessful = false;

  for (const comment of comments) {
    const content = (comment.content || '').toLowerCase();
    const context = (comment.context || '').toLowerCase();
    const combined = `${content} ${context}`;

    if (autoRemediationKeywords.some(kw => combined.includes(kw))) {
      isAutoRemediated = true;
      if (successKeywords.some(kw => combined.includes(kw))) {
        wasSuccessful = true;
      }
    }
  }

  // If closed and auto-remediated, assume success
  if (isAutoRemediated && problem.status === 'CLOSED' && !wasSuccessful) {
    wasSuccessful = true;
  }

  return { isAutoRemediated, wasSuccessful };
}

/**
 * Detect if auto-remediation was successful (alias)
 */
export function detectAutoRemediationSuccess(problem: Problem): boolean {
  return detectAutoRemediation(problem).wasSuccessful;
}

/**
 * Calculate confidence score for the classification
 */
export function calculateConfidence(
  score: number,
  reasonCount: number,
  thresholds: FPThresholds = DEFAULT_FP_THRESHOLDS
): number {
  // Higher confidence when score is far from thresholds
  const distanceFromThreshold = Math.min(
    Math.abs(score - thresholds.fpScoreThreshold),
    Math.abs(score - thresholds.uncertainThreshold)
  );

  // Base confidence from distance
  let confidence = Math.min(0.5 + distanceFromThreshold, 0.8);

  // Boost for multiple supporting reasons
  confidence += Math.min(reasonCount * 0.05, 0.2);

  return Math.min(1.0, confidence);
}

/**
 * Quick classification without full analysis
 */
export function quickClassify(problem: Problem): FPClassification {
  const duration = problem.duration || 0;
  const problemAny = problem as any;
  
  // Fast path for obvious false positives
  if (duration < 5) {
    const isAutoRemediated = AUTO_REMEDIATION_VALUES.includes(
      String(problemAny.Autoremediado || '').toLowerCase()
    );
    if (isAutoRemediated) {
      return FPClassification.FALSE_POSITIVE;
    }
  }

  // Fast path for obvious true positives
  if (duration > 60 && problem.recentComments?.totalCount > 0) {
    return FPClassification.TRUE_POSITIVE;
  }

  // Need full analysis
  return calculateFPScore(problem).classification;
}

/**
 * Batch calculate FP scores for multiple problems
 */
export function batchCalculateFPScores(
  problems: Problem[],
  thresholds?: FPThresholds
): Array<{ problem: Problem; fpScore: FPScoreResult }> {
  return problems.map(problem => ({
    problem,
    fpScore: calculateFPScore(problem, thresholds)
  }));
}

/**
 * Get FP rate for a set of problems
 */
export function calculateFPRate(problems: Problem[], thresholds?: FPThresholds): {
  total: number;
  falsePositives: number;
  truePositives: number;
  uncertain: number;
  fpRate: number;
} {
  const results = batchCalculateFPScores(problems, thresholds);
  
  const counts = {
    [FPClassification.FALSE_POSITIVE]: 0,
    [FPClassification.TRUE_POSITIVE]: 0,
    [FPClassification.UNCERTAIN]: 0
  };

  for (const { fpScore } of results) {
    counts[fpScore.classification]++;
  }

  const total = problems.length;
  return {
    total,
    falsePositives: counts[FPClassification.FALSE_POSITIVE],
    truePositives: counts[FPClassification.TRUE_POSITIVE],
    uncertain: counts[FPClassification.UNCERTAIN],
    fpRate: total > 0 ? counts[FPClassification.FALSE_POSITIVE] / total : 0
  };
}
