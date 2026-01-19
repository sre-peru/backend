// ============================================================================
// FALSE POSITIVES SERVICE
// ============================================================================
// Path: src/services/false-positives.service.ts

import { Collection, Document } from 'mongodb';
import { getDatabase } from '../config/database';

// ============================================================================
// TYPES
// ============================================================================

export type FPClassification = 'FALSE_POSITIVE' | 'TRUE_POSITIVE' | 'UNCERTAIN';

interface FPFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  severityLevel?: string;
  managementZone?: string;
  entityType?: string;
  classification?: FPClassification;
}

interface FPScoreResult {
  score: number;
  reasons: string[];
  classification: FPClassification;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getCollection(): Collection {
  const db = getDatabase();
  return db.collection('problems');
}

function buildMatchStage(filters: FPFilters): Document {
  const match: Document = {};
  
  if (filters.startDate || filters.endDate) {
    match.startTime = {};
    if (filters.startDate) match.startTime.$gte = filters.startDate;
    if (filters.endDate) match.startTime.$lte = filters.endDate;
  }
  
  if (filters.status) match.status = filters.status;
  if (filters.severityLevel) match.severityLevel = filters.severityLevel;
  if (filters.managementZone) match['managementZones.name'] = filters.managementZone;
  if (filters.entityType) match['affectedEntities.entityId.type'] = filters.entityType;
  
  return match;
}

/**
 * Calcula el score de falso positivo para un problema
 */
function calculateFPScore(problem: any): FPScoreResult {
  let score = 0;
  const reasons: string[] = [];
  
  const duration = problem.duration || 0;
  const isAutoRemediated = ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1'].includes(String(problem.Autoremediado));
  const autoRemediationSuccess = ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1'].includes(String(problem.FuncionoAutoRemediacion));
  const severity = problem.severityLevel || '';
  const commentCount = problem.recentComments?.totalCount || 0;
  
  // 1. Duración muy corta (+0.35)
  if (duration < 5) {
    score += 0.35;
    reasons.push(`Duración muy corta (${duration.toFixed(1)}min)`);
  } else if (duration < 15) {
    score += 0.20;
    reasons.push(`Duración corta (${duration.toFixed(1)}min)`);
  } else if (duration < 60) {
    score += 0.10;
    reasons.push(`Duración media (${duration.toFixed(1)}min)`);
  }
  
  // 2. Auto-remediación exitosa (+0.25)
  if (isAutoRemediated && autoRemediationSuccess) {
    score += 0.25;
    reasons.push('Auto-remediación exitosa');
  } else if (isAutoRemediated) {
    score += 0.10;
    reasons.push('Auto-remediación intentada');
  }
  
  // 3. Sin comentarios (+0.05)
  if (commentCount === 0) {
    score += 0.05;
    reasons.push('Sin comentarios/investigación');
  }
  
  // 4. Severidad baja (+0.10)
  if (['RESOURCE_CONTENTION', 'PERFORMANCE', 'INFO'].includes(severity)) {
    score += 0.10;
    reasons.push(`Severidad baja (${severity})`);
  }
  
  // 5. Cierre manual rápido (+0.15)
  if (duration < 10 && problem.status === 'CLOSED' && !isAutoRemediated) {
    score += 0.15;
    reasons.push('Cierre manual rápido');
  }
  
  // Limitar score a [0, 1]
  score = Math.min(1.0, Math.max(0.0, score));
  
  // Clasificar
  let classification: 'FALSE_POSITIVE' | 'TRUE_POSITIVE' | 'UNCERTAIN';
  if (score >= 0.6) {
    classification = 'FALSE_POSITIVE';
  } else if (score >= 0.3) {
    classification = 'UNCERTAIN';
  } else {
    classification = 'TRUE_POSITIVE';
  }
  
  return { score, reasons, classification };
}

interface FPSummary {
  totalProblems: number;
  falsePositives: number;
  truePositives: number;
  uncertain: number;
  falsePositiveRate: number;
  autoRemediationRate: number;
  avgDurationMinutes: number;
  dateRange: { start: string | null; end: string | null };
  byDuration: Record<string, number>;
  bySeverity: Record<string, number>;
  byManagementZone: Record<string, number>;
  byClassification: Record<FPClassification, number>;
}

interface FPProblem {
  problemId: string;
  displayId: string;
  title: string;
  status: string;
  severityLevel: string;
  impactLevel: string;
  duration: number;
  startTime: string;
  endTime: string;
  entityId: string;
  entityName: string;
  entityType: string;
  managementZones: string[];
  fpScore: number;
  fpReasons: string[];
  classification: FPClassification;
  isAutoRemediated: boolean;
  autoRemediationSuccess: boolean;
  commentCount: number;
}

interface FPAnalysisResponse {
  problems: FPProblem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface EntityAnalysis {
  entityId: string;
  entityName: string;
  entityType: string;
  totalProblems: number;
  falsePositives: number;
  truePositives: number;
  uncertain: number;
  falsePositiveRate: number;
  avgDurationMinutes: number;
  autoRemediationRate: number;
  lastOccurrence: string;
  trend: string;
}

interface RecurringEntity {
  entityId: string;
  entityName: string;
  entityType: string;
  occurrences: number;
  avgDurationMinutes: number;
  falsePositiveRate: number;
  lastOccurrence: string;
  firstOccurrence: string;
  trend: string;
  problemTypes: string[];
}

interface Recommendation {
  id: string;
  type: string;
  category: string;
  title: string;
  description: string;
  action: string;
  impact: string;
  affectedEntities: string[];
  priority: number;
}

// ============================================================================
// FALSE POSITIVES SERVICE CLASS
// ============================================================================

export class FalsePositivesService {
  
  // ==========================================================================
  // GET SUMMARY - Resumen ejecutivo
  // ==========================================================================
  
  async getSummary(filters: FPFilters = {}): Promise<FPSummary> {
    const collection = getCollection();
    const match = buildMatchStage(filters);
    
    // Pipeline para obtener todos los datos necesarios
    const pipeline = [
      { $match: match },
      {
        $addFields: {
          isAutoRemediated: {
            $in: ['$Autoremediado', ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1']]
          },
          autoRemediationSuccess: {
            $in: ['$FuncionoAutoRemediacion', ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1']]
          },
          durationCategory: {
            $switch: {
              branches: [
                { case: { $lt: ['$duration', 5] }, then: '<5min' },
                { case: { $lt: ['$duration', 15] }, then: '5-15min' },
                { case: { $lt: ['$duration', 60] }, then: '15-60min' },
                { case: { $lt: ['$duration', 240] }, then: '1-4h' },
              ],
              default: '>4h'
            }
          },
          // Calcular score simplificado en MongoDB
          fpScore: {
            $add: [
              { $cond: [{ $lt: ['$duration', 5] }, 0.35, { $cond: [{ $lt: ['$duration', 15] }, 0.20, { $cond: [{ $lt: ['$duration', 60] }, 0.10, 0] }] }] },
              { $cond: [{ $and: [{ $in: ['$Autoremediado', ['Si', 'Sí']] }, { $in: ['$FuncionoAutoRemediacion', ['Si', 'Sí']] }] }, 0.25, { $cond: [{ $in: ['$Autoremediado', ['Si', 'Sí']] }, 0.10, 0] }] },
              { $cond: [{ $in: ['$severityLevel', ['RESOURCE_CONTENTION', 'PERFORMANCE', 'INFO']] }, 0.10, 0] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalProblems: { $sum: 1 },
          falsePositives: { $sum: { $cond: [{ $gte: ['$fpScore', 0.6] }, 1, 0] } },
          truePositives: { $sum: { $cond: [{ $lt: ['$fpScore', 0.3] }, 1, 0] } },
          uncertain: { $sum: { $cond: [{ $and: [{ $gte: ['$fpScore', 0.3] }, { $lt: ['$fpScore', 0.6] }] }, 1, 0] } },
          autoRemediated: { $sum: { $cond: ['$isAutoRemediated', 1, 0] } },
          totalDuration: { $sum: { $ifNull: ['$duration', 0] } },
          minDate: { $min: '$startTime' },
          maxDate: { $max: '$startTime' },
          // Distribución por duración
          durationLt5: { $sum: { $cond: [{ $lt: ['$duration', 5] }, 1, 0] } },
          duration5to15: { $sum: { $cond: [{ $and: [{ $gte: ['$duration', 5] }, { $lt: ['$duration', 15] }] }, 1, 0] } },
          duration15to60: { $sum: { $cond: [{ $and: [{ $gte: ['$duration', 15] }, { $lt: ['$duration', 60] }] }, 1, 0] } },
          duration1to4h: { $sum: { $cond: [{ $and: [{ $gte: ['$duration', 60] }, { $lt: ['$duration', 240] }] }, 1, 0] } },
          durationGt4h: { $sum: { $cond: [{ $gte: ['$duration', 240] }, 1, 0] } }
        }
      }
    ];
    
    const results = await collection.aggregate(pipeline).toArray();
    const data = results[0] || {
      totalProblems: 0,
      falsePositives: 0,
      truePositives: 0,
      uncertain: 0,
      autoRemediated: 0,
      totalDuration: 0,
      minDate: null,
      maxDate: null
    };
    
    // Obtener distribución por severidad
    const severityPipeline = [
      { $match: match },
      { $group: { _id: '$severityLevel', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ];
    const severityResults = await collection.aggregate(severityPipeline).toArray();
    const bySeverity: Record<string, number> = {};
    severityResults.forEach(item => {
      bySeverity[item._id || 'UNKNOWN'] = item.count;
    });
    
    // Obtener distribución por management zone
    const mzPipeline = [
      { $match: match },
      { $unwind: '$managementZones' },
      { $group: { _id: '$managementZones.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ];
    const mzResults = await collection.aggregate(mzPipeline).toArray();
    const byManagementZone: Record<string, number> = {};
    mzResults.forEach(item => {
      byManagementZone[item._id || 'Sin zona'] = item.count;
    });
    
    return {
      totalProblems: data.totalProblems,
      falsePositives: data.falsePositives,
      truePositives: data.truePositives,
      uncertain: data.uncertain,
      falsePositiveRate: data.totalProblems > 0 ? data.falsePositives / data.totalProblems : 0,
      autoRemediationRate: data.totalProblems > 0 ? data.autoRemediated / data.totalProblems : 0,
      avgDurationMinutes: data.totalProblems > 0 ? data.totalDuration / data.totalProblems : 0,
      dateRange: {
        start: data.minDate,
        end: data.maxDate
      },
      byDuration: {
        '<5min': data.durationLt5 || 0,
        '5-15min': data.duration5to15 || 0,
        '15-60min': data.duration15to60 || 0,
        '1-4h': data.duration1to4h || 0,
        '>4h': data.durationGt4h || 0
      },
      bySeverity,
      byManagementZone,
      byClassification: {
        FALSE_POSITIVE: data.falsePositives,
        TRUE_POSITIVE: data.truePositives,
        UNCERTAIN: data.uncertain
      }
    };
  }
  
  // ==========================================================================
  // GET ANALYSIS - Lista de problemas con score FP
  // ==========================================================================
  
  async getAnalysis(filters: FPFilters = {}, page: number = 1, limit: number = 50): Promise<FPAnalysisResponse> {
    const collection = getCollection();
    const match = buildMatchStage(filters);
    const skip = (page - 1) * limit;
    
    // Obtener total
    const total = await collection.countDocuments(match);
    
    // Obtener problemas
    const problems = await collection
      .find(match)
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    // Calcular score FP para cada problema
    const analyzedProblems = problems.map(problem => {
      const { score, reasons, classification } = calculateFPScore(problem);
      
      return {
        problemId: problem.problemId,
        displayId: problem.displayId,
        title: problem.title,
        status: problem.status,
        severityLevel: problem.severityLevel,
        impactLevel: problem.impactLevel,
        duration: problem.duration || 0,
        startTime: problem.startTime,
        endTime: problem.endTime,
        entityId: problem.affectedEntities?.[0]?.entityId?.id || '',
        entityName: problem.affectedEntities?.[0]?.entityId?.name || 'Unknown',
        entityType: problem.affectedEntities?.[0]?.entityId?.type || 'Unknown',
        managementZones: problem.managementZones?.map((mz: any) => mz.name) || [],
        fpScore: Math.round(score * 100) / 100,
        fpReasons: reasons,
        classification,
        isAutoRemediated: ['Si', 'Sí'].includes(String(problem.Autoremediado)),
        autoRemediationSuccess: ['Si', 'Sí'].includes(String(problem.FuncionoAutoRemediacion)),
        commentCount: problem.recentComments?.totalCount || 0
      };
    });
    
    // Filtrar por clasificación si se especifica
    let filteredProblems = analyzedProblems;
    if (filters.classification) {
      filteredProblems = analyzedProblems.filter(p => p.classification === filters.classification);
    }
    
    return {
      problems: filteredProblems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
  
  // ==========================================================================
  // GET BY ENTITY - Análisis agrupado por entidad
  // ==========================================================================
  
  async getByEntity(filters: FPFilters = {}, page: number = 1, limit: number = 20): Promise<{ entities: EntityAnalysis[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const collection = getCollection();
    const match = buildMatchStage(filters);
    const skip = (page - 1) * limit;
    
    const pipeline = [
      { $match: match },
      { $unwind: '$affectedEntities' },
      {
        $addFields: {
          fpScore: {
            $add: [
              { $cond: [{ $lt: ['$duration', 5] }, 0.35, { $cond: [{ $lt: ['$duration', 15] }, 0.20, { $cond: [{ $lt: ['$duration', 60] }, 0.10, 0] }] }] },
              { $cond: [{ $and: [{ $in: ['$Autoremediado', ['Si', 'Sí']] }, { $in: ['$FuncionoAutoRemediacion', ['Si', 'Sí']] }] }, 0.25, { $cond: [{ $in: ['$Autoremediado', ['Si', 'Sí']] }, 0.10, 0] }] },
              { $cond: [{ $in: ['$severityLevel', ['RESOURCE_CONTENTION', 'PERFORMANCE', 'INFO']] }, 0.10, 0] }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$affectedEntities.entityId.id',
          entityName: { $first: '$affectedEntities.entityId.name' },
          entityType: { $first: '$affectedEntities.entityId.type' },
          totalProblems: { $sum: 1 },
          falsePositives: { $sum: { $cond: [{ $gte: ['$fpScore', 0.6] }, 1, 0] } },
          truePositives: { $sum: { $cond: [{ $lt: ['$fpScore', 0.3] }, 1, 0] } },
          uncertain: { $sum: { $cond: [{ $and: [{ $gte: ['$fpScore', 0.3] }, { $lt: ['$fpScore', 0.6] }] }, 1, 0] } },
          totalDuration: { $sum: { $ifNull: ['$duration', 0] } },
          autoRemediated: { $sum: { $cond: [{ $in: ['$Autoremediado', ['Si', 'Sí']] }, 1, 0] } },
          lastOccurrence: { $max: '$startTime' }
        }
      },
      { $sort: { totalProblems: -1 } },
      {
        $facet: {
          entities: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }]
        }
      }
    ];
    
    const results = await collection.aggregate(pipeline).toArray();
    const entities = results[0]?.entities || [];
    const total = results[0]?.total[0]?.count || 0;
    
    const mappedEntities = entities.map((entity: any) => ({
      entityId: entity._id,
      entityName: entity.entityName || 'Unknown',
      entityType: entity.entityType || 'Unknown',
      totalProblems: entity.totalProblems,
      falsePositives: entity.falsePositives,
      truePositives: entity.truePositives,
      uncertain: entity.uncertain,
      falsePositiveRate: entity.totalProblems > 0 ? entity.falsePositives / entity.totalProblems : 0,
      avgDurationMinutes: entity.totalProblems > 0 ? entity.totalDuration / entity.totalProblems : 0,
      autoRemediationRate: entity.totalProblems > 0 ? entity.autoRemediated / entity.totalProblems : 0,
      lastOccurrence: entity.lastOccurrence,
      trend: 'stable' // Simplificado por ahora
    }));
    
    return {
      entities: mappedEntities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
  
  // ==========================================================================
  // GET RECURRING - Entidades con problemas recurrentes
  // ==========================================================================
  
  async getRecurring(filters: FPFilters = {}, minOccurrences: number = 5): Promise<{ recurringEntities: RecurringEntity[] }> {
    const collection = getCollection();
    const match = buildMatchStage(filters);
    
    const pipeline = [
      { $match: match },
      { $unwind: '$affectedEntities' },
      {
        $group: {
          _id: '$affectedEntities.entityId.id',
          entityName: { $first: '$affectedEntities.entityId.name' },
          entityType: { $first: '$affectedEntities.entityId.type' },
          occurrences: { $sum: 1 },
          totalDuration: { $sum: { $ifNull: ['$duration', 0] } },
          shortDurationCount: { $sum: { $cond: [{ $lt: ['$duration', 5] }, 1, 0] } },
          lastOccurrence: { $max: '$startTime' },
          firstOccurrence: { $min: '$startTime' },
          problemTypes: { $addToSet: '$title' }
        }
      },
      { $match: { occurrences: { $gte: minOccurrences } } },
      { $sort: { occurrences: -1 } },
      { $limit: 50 }
    ];
    
    const results = await collection.aggregate(pipeline).toArray();
    
    const recurringEntities = results.map((entity: any) => ({
      entityId: entity._id,
      entityName: entity.entityName || 'Unknown',
      entityType: entity.entityType || 'Unknown',
      occurrences: entity.occurrences,
      avgDurationMinutes: entity.occurrences > 0 ? entity.totalDuration / entity.occurrences : 0,
      falsePositiveRate: entity.occurrences > 0 ? entity.shortDurationCount / entity.occurrences : 0,
      lastOccurrence: entity.lastOccurrence,
      firstOccurrence: entity.firstOccurrence,
      trend: 'stable',
      problemTypes: entity.problemTypes?.slice(0, 5) || []
    }));
    
    return { recurringEntities };
  }
  
  // ==========================================================================
  // GET RECOMMENDATIONS
  // ==========================================================================
  
  async getRecommendations(filters: FPFilters = {}): Promise<{ recommendations: Recommendation[]; summary: { critical: number; warning: number; info: number } }> {
    const summary = await this.getSummary(filters);
    const recurring = await this.getRecurring(filters, 5);
    
    const recommendations: any[] = [];
    
    // Recomendación por tasa de FP
    if (summary.falsePositiveRate > 0.5) {
      recommendations.push({
        id: 'high-fp-rate',
        type: 'CRITICAL',
        category: 'threshold',
        title: 'Tasa crítica de falsos positivos',
        description: `${(summary.falsePositiveRate * 100).toFixed(1)}% de los problemas son falsos positivos. Esto indica umbrales de alerta demasiado sensibles.`,
        action: 'Revisar y ajustar los umbrales de alertas en Dynatrace para reducir ruido.',
        impact: `Reducción potencial de ${summary.falsePositives.toLocaleString()} alertas innecesarias`,
        affectedEntities: [],
        priority: 1
      });
    } else if (summary.falsePositiveRate > 0.3) {
      recommendations.push({
        id: 'medium-fp-rate',
        type: 'WARNING',
        category: 'threshold',
        title: 'Tasa elevada de falsos positivos',
        description: `${(summary.falsePositiveRate * 100).toFixed(1)}% de los problemas son falsos positivos.`,
        action: 'Considerar ajustar umbrales de detección para problemas transitorios.',
        impact: `Reducción potencial de ${summary.falsePositives.toLocaleString()} alertas`,
        affectedEntities: [],
        priority: 2
      });
    }
    
    // Recomendación por entidades recurrentes
    const highRecurrence = recurring.recurringEntities?.filter((e: any) => e.occurrences >= 10) || [];
    if (highRecurrence.length > 0) {
      recommendations.push({
        id: 'recurring-entities',
        type: 'WARNING',
        category: 'entity',
        title: `${highRecurrence.length} entidades con alta recurrencia`,
        description: `Hay entidades generando más de 10 problemas cada una. Esto puede indicar problemas de configuración o infraestructura.`,
        action: 'Investigar las entidades más problemáticas y aplicar correcciones permanentes.',
        impact: 'Reducción significativa de alertas repetitivas',
        affectedEntities: highRecurrence.slice(0, 5).map((e: any) => e.entityName),
        priority: 2
      });
    }
    
    // Recomendación por auto-remediación
    if (summary.autoRemediationRate > 0.5) {
      recommendations.push({
        id: 'high-auto-remediation',
        type: 'INFO',
        category: 'auto-remediation',
        title: 'Alta tasa de auto-remediación',
        description: `${(summary.autoRemediationRate * 100).toFixed(1)}% de problemas se auto-remedian. Considerar aumentar umbrales para evitar alertas de problemas transitorios.`,
        action: 'Agregar delays antes de generar alertas para problemas que típicamente se auto-remedian.',
        impact: 'Reducción de ruido y fatiga de alertas',
        affectedEntities: [],
        priority: 3
      });
    }
    
    // Recomendación por duración corta
    const shortDurationRate = summary.byDuration['<5min'] / summary.totalProblems;
    if (shortDurationRate > 0.3) {
      recommendations.push({
        id: 'short-duration',
        type: 'INFO',
        category: 'duration',
        title: 'Muchos problemas de corta duración',
        description: `${(shortDurationRate * 100).toFixed(1)}% de problemas duran menos de 5 minutos. Estos son típicamente transitorios.`,
        action: 'Implementar "problema warming" - esperar confirmación antes de alertar.',
        impact: `Potencial reducción de ${summary.byDuration['<5min'].toLocaleString()} alertas`,
        affectedEntities: [],
        priority: 3
      });
    }
    
    return {
      recommendations: recommendations.sort((a, b) => a.priority - b.priority),
      summary: {
        critical: recommendations.filter(r => r.type === 'CRITICAL').length,
        warning: recommendations.filter(r => r.type === 'WARNING').length,
        info: recommendations.filter(r => r.type === 'INFO').length
      }
    };
  }
}

export const falsePositivesService = new FalsePositivesService();
