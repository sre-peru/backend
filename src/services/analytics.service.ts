/**
 * Analytics Service - Business Logic for Analytics
 * Optimized with MongoDB Aggregation Pipelines
 */
import { Collection, Document } from 'mongodb';
import { database } from '../config/database';
import { DashboardKPIs, ProblemFilters } from '../types/problem.types';

export class AnalyticsService {
  /**
   * Get MongoDB collection
   */
  private getCollection(): Collection {
    return database.getCollection();
  }

  /**
   * Build MongoDB match stage from ProblemFilters
   */
  private buildMatchStage(filters?: ProblemFilters): Document {
    const match: Document = {};

    if (!filters) return match;

    // Impact Level filter
    if (filters.impactLevel && filters.impactLevel.length > 0) {
      match.impactLevel = { $in: filters.impactLevel };
    }

    // Severity Level filter
    if (filters.severityLevel && filters.severityLevel.length > 0) {
      match.severityLevel = { $in: filters.severityLevel };
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      match.status = { $in: filters.status };
    }

    // Management Zones filter
    if (filters.managementZones && filters.managementZones.length > 0) {
      match['managementZones.name'] = { $in: filters.managementZones };
    }

    // Affected Entity Types filter
    if (filters.affectedEntityTypes && filters.affectedEntityTypes.length > 0) {
      match['affectedEntities.entityId.type'] = { $in: filters.affectedEntityTypes };
    }

    // Entity Tags filter
    if (filters.entityTags && filters.entityTags.length > 0) {
      match['entityTags.stringRepresentation'] = { $in: filters.entityTags };
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      match.startTime = {};
      if (filters.dateFrom) {
        match.startTime.$gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        match.startTime.$lte = filters.dateTo;
      }
    }

    // Has comments filter
    if (filters.hasComments !== undefined) {
      if (filters.hasComments) {
        match['recentComments.totalCount'] = { $gt: 0 };
      } else {
        match['recentComments.totalCount'] = 0;
      }
    }

    // GitHub Actions filter
    if (filters.hasGitHubActions) {
      match['recentComments.comments.content'] = { $regex: 'GitHub Actions', $options: 'i' };
    }

    // Evidence Type filter
    if (filters.evidenceType && filters.evidenceType.length > 0) {
      match['evidenceDetails.details.evidenceType'] = { $in: filters.evidenceType };
    }

    // Root Cause filter
    if (filters.hasRootCause !== undefined && filters.hasRootCause !== null) {
      if (filters.hasRootCause) {
        match.rootCauseEntity = { $ne: null, $exists: true };
      } else {
        match.rootCauseEntity = null;
      }
    }

    // Duration filter
    if (filters.durationMin !== undefined || filters.durationMax !== undefined) {
      match.duration = {};
      if (filters.durationMin !== undefined) {
        match.duration.$gte = filters.durationMin;
      }
      if (filters.durationMax !== undefined) {
        match.duration.$lte = filters.durationMax;
      }
    }

    // Autoremediado filter - MongoDB stores 'Si', 'Sí', 'No' as strings
    if (filters.autoremediado !== undefined && filters.autoremediado !== null) {
      if (filters.autoremediado === true) {
        match.Autoremediado = { $in: ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1'] };
      } else {
        match.Autoremediado = { $nin: ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1'] };
      }
    }

    // FuncionoAutoRemediacion filter - MongoDB stores 'Si', 'Sí', 'No' as strings
    if (filters.funcionoAutoRemediacion !== undefined && filters.funcionoAutoRemediacion !== null) {
      if (filters.funcionoAutoRemediacion === true) {
        match.FuncionoAutoRemediacion = { $in: ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1'] };
      } else {
        match.FuncionoAutoRemediacion = { $nin: ['Si', 'Sí', 'si', 'sí', 'YES', 'yes', 'true', '1'] };
      }
    }

    return match;
  }

  /**
   * Calculate Dashboard KPIs using aggregation
   */
  async getKPIs(filters?: ProblemFilters): Promise<DashboardKPIs> {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalProblems: { $sum: 1 },
          openProblems: { $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] } },
          closedProblems: { $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] } },
          totalDuration: { $sum: { $ifNull: ['$duration', 0] } },
          problemsWithComments: {
            $sum: { $cond: [{ $gt: ['$recentComments.totalCount', 0] }, 1, 0] }
          },
          criticalProblems: {
            $sum: {
              $cond: [{ $in: ['$severityLevel', ['AVAILABILITY', 'ERROR']] }, 1, 0]
            }
          },
          // Sum of durations for closed problems
          closedDurationSum: {
            $sum: {
              $cond: [{ $eq: ['$status', 'CLOSED'] }, { $ifNull: ['$duration', 0] }, 0]
            }
          }
        }
      }
    ];

    const [result] = await collection.aggregate(pipeline).toArray();

    if (!result) {
      return {
        totalProblems: 0,
        openProblems: 0,
        closedProblems: 0,
        totalDuration: 0,
        avgResolutionTime: 0,
        problemsWithComments: 0,
        githubActionProblems: 0,
        criticalProblems: 0,
      };
    }

    // Get GitHub Actions count separately (requires text matching in array)
    const githubActionsCount = await collection.countDocuments({
      ...match,
      'recentComments.comments.content': { $regex: 'github actions', $options: 'i' }
    });

    const avgResolutionTime = result.closedProblems > 0
      ? Math.round(result.closedDurationSum / result.closedProblems)
      : 0;

    return {
      totalProblems: result.totalProblems,
      openProblems: result.openProblems,
      closedProblems: result.closedProblems,
      totalDuration: result.totalDuration,
      avgResolutionTime,
      problemsWithComments: result.problemsWithComments,
      githubActionProblems: githubActionsCount,
      criticalProblems: result.criticalProblems,
    };
  }

  /**
   * Get time series data for problems using aggregation
   */
  async getTimeSeries(granularity: 'day' | 'week' | 'month' = 'day', filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    // Build date format based on granularity
    let dateFormat: string;
    if (granularity === 'day') {
      dateFormat = '%Y-%m-%d';
    } else if (granularity === 'week') {
      dateFormat = '%Y-W%V';
    } else {
      dateFormat = '%Y-%m';
    }

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          parsedDate: {
            $cond: {
              if: { $eq: [{ $type: '$startTime' }, 'string'] },
              then: { $dateFromString: { dateString: '$startTime', onError: new Date() } },
              else: '$startTime'
            }
          }
        }
      },
      {
        $group: {
          _id: {
            timestamp: { $dateToString: { format: dateFormat, date: '$parsedDate' } },
            severity: '$severityLevel'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.timestamp',
          severityBreakdown: {
            $push: {
              severity: '$_id.severity',
              count: '$count'
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const data = results.map(item => {
      const severityBreakdown: Record<string, number> = {};
      item.severityBreakdown.forEach((s: { severity: string; count: number }) => {
        severityBreakdown[s.severity] = s.count;
      });
      return {
        timestamp: item._id,
        severityBreakdown
      };
    });

    return { data };
  }

  /**
   * Get impact vs severity matrix using aggregation
   */
  async getImpactSeverityMatrix(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            impact: '$impactLevel',
            severity: '$severityLevel'
          },
          count: { $sum: 1 }
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const matrix: Record<string, Record<string, number>> = {};
    results.forEach(item => {
      if (!matrix[item._id.impact]) {
        matrix[item._id.impact] = {};
      }
      matrix[item._id.impact][item._id.severity] = item.count;
    });

    return { matrix };
  }

  /**
   * Get top affected entities using aggregation
   */
  async getTopEntities(limit: number = 10, filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      { $unwind: '$affectedEntities' },
      {
        $group: {
          _id: '$affectedEntities.entityId.id',
          name: { $first: '$affectedEntities.name' },
          type: { $first: '$affectedEntities.entityId.type' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          name: 1,
          type: 1,
          problemCount: '$count'
        }
      }
    ];

    const entities = await collection.aggregate(pipeline).toArray();

    return { entities };
  }

  /**
   * Get management zones analysis using aggregation
   */
  async getManagementZones(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const severityWeights: Record<string, number> = {
      AVAILABILITY: 5,
      ERROR: 4,
      PERFORMANCE: 3,
      RESOURCE_CONTENTION: 2,
      CUSTOM_ALERT: 1,
    };

    const pipeline = [
      { $match: match },
      { $unwind: '$managementZones' },
      {
        $group: {
          _id: '$managementZones.name',
          problemCount: { $sum: 1 },
          severities: { $push: '$severityLevel' }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          problemCount: 1,
          severities: 1
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const zones = results.map(zone => {
      const avgSeverity = zone.severities.reduce((sum: number, sev: string) => {
        return sum + (severityWeights[sev] || 0);
      }, 0) / zone.severities.length;

      return {
        name: zone.name,
        problemCount: zone.problemCount,
        avgSeverity: Number(avgSeverity.toFixed(2)),
      };
    });

    return { zones };
  }

  /**
   * Get remediation funnel using aggregation with $facet
   */
  async getRemediationFunnel(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $facet: {
          total: [{ $count: 'count' }],
          withComments: [
            { $match: { 'recentComments.totalCount': { $gt: 0 } } },
            { $count: 'count' }
          ],
          withGitHubActions: [
            { $match: { 'recentComments.comments.content': { $regex: 'github actions', $options: 'i' } } },
            { $count: 'count' }
          ],
          withSuccess: [
            {
              $match: {
                'recentComments.comments.content': {
                  $regex: '(success|completed)',
                  $options: 'i'
                }
              }
            },
            { $count: 'count' }
          ],
          closed: [
            { $match: { status: 'CLOSED' } },
            { $count: 'count' }
          ]
        }
      }
    ];

    const [result] = await collection.aggregate(pipeline).toArray();

    const totalProblems = result.total[0]?.count || 0;
    const problemsWithComments = result.withComments[0]?.count || 0;
    const problemsWithGitHubActions = result.withGitHubActions[0]?.count || 0;
    const problemsWithSuccess = result.withSuccess[0]?.count || 0;
    const closedProblems = result.closed[0]?.count || 0;

    const stages = [
      {
        name: 'Total Problems',
        count: totalProblems,
        percentage: 100,
      },
      {
        name: 'With Comments',
        count: problemsWithComments,
        percentage: totalProblems > 0 ? Number(((problemsWithComments / totalProblems) * 100).toFixed(2)) : 0,
      },
      {
        name: 'GitHub Actions Initiated',
        count: problemsWithGitHubActions,
        percentage: totalProblems > 0 ? Number(((problemsWithGitHubActions / totalProblems) * 100).toFixed(2)) : 0,
      },
      {
        name: 'Remediation Successful',
        count: problemsWithSuccess,
        percentage: totalProblems > 0 ? Number(((problemsWithSuccess / totalProblems) * 100).toFixed(2)) : 0,
      },
      {
        name: 'Closed',
        count: closedProblems,
        percentage: totalProblems > 0 ? Number(((closedProblems / totalProblems) * 100).toFixed(2)) : 0,
      },
    ];

    return { stages };
  }

  /**
   * Get duration distribution using aggregation with $switch
   */
  async getDurationDistribution(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 5] }, then: 'less_than_5' },
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 10] }, then: '5_to_10' },
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 30] }, then: '10_to_30' },
                { case: { $lt: [{ $ifNull: ['$duration', 0] }, 180] }, then: '30_to_180' },
              ],
              default: 'more_than_180'
            }
          },
          count: { $sum: 1 }
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    const categories: Record<string, number> = {
      'less_than_5': 0,
      '5_to_10': 0,
      '10_to_30': 0,
      '30_to_180': 0,
      'more_than_180': 0,
    };

    results.forEach(item => {
      categories[item._id] = item.count;
    });

    return { categories };
  }

  /**
   * Get evidence types breakdown using aggregation
   */
  async getEvidenceTypes(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      { $unwind: '$evidenceDetails.details' },
      {
        $group: {
          _id: {
            evidenceType: '$evidenceDetails.details.evidenceType',
            eventType: { $ifNull: ['$evidenceDetails.details.eventType', 'UNKNOWN'] }
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.evidenceType',
          children: {
            $push: {
              name: '$_id.eventType',
              value: '$count'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          children: 1
        }
      }
    ];

    const breakdown = await collection.aggregate(pipeline).toArray();

    return { breakdown };
  }

  /**
   * Get root cause entity analysis (treemap data) using aggregation
   */
  async getRootCauseAnalysis(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: { ...match, 'rootCauseEntity.name': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$rootCauseEntity.name',
          value: { $sum: 1 }
        }
      },
      { $sort: { value: -1 } },
      {
        $project: {
          _id: 0,
          name: '$_id',
          value: 1
        }
      }
    ];

    const data = await collection.aggregate(pipeline).toArray();

    return { data };
  }

  /**
   * Get root cause distribution (pie chart data) using aggregation
   */
  async getRootCauseDistribution(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          withRootCause: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$rootCauseEntity', null] }, { $gt: [{ $type: '$rootCauseEntity' }, 'null'] }] },
                1,
                0
              ]
            }
          },
          total: { $sum: 1 }
        }
      }
    ];

    const [result] = await collection.aggregate(pipeline).toArray();

    const withRootCause = result?.withRootCause || 0;
    const total = result?.total || 0;
    const withoutRootCause = total - withRootCause;

    const data = [
      { name: 'With Root Cause', value: withRootCause },
      { name: 'Without Root Cause', value: withoutRootCause },
    ];

    return { data };
  }

  /**
   * Get impact level distribution (doughnut chart data) using aggregation
   */
  async getImpactDistribution(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$impactLevel',
          value: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          value: 1
        }
      }
    ];

    const data = await collection.aggregate(pipeline).toArray();

    return { data };
  }

  /**
   * Get severity level distribution (doughnut chart data) using aggregation
   */
  async getSeverityDistribution(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$severityLevel',
          value: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          value: 1
        }
      }
    ];

    const data = await collection.aggregate(pipeline).toArray();

    return { data };
  }

  /**
   * Get root cause existence distribution (doughnut chart data) using aggregation
   */
  async getHasRootCauseDistribution(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          withRootCause: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$rootCauseEntity', null] },
                    { $ne: ['$rootCauseEntity', {}] },
                    { $gt: [{ $size: { $objectToArray: { $ifNull: ['$rootCauseEntity', {}] } } }, 0] }
                  ]
                },
                1,
                0
              ]
            }
          },
          total: { $sum: 1 }
        }
      }
    ];

    const [result] = await collection.aggregate(pipeline).toArray();

    const withRootCause = result?.withRootCause || 0;
    const total = result?.total || 0;
    const withoutRootCause = total - withRootCause;

    const data = [
      { name: 'Sí', value: withRootCause },
      { name: 'No', value: withoutRootCause },
    ];

    return { data };
  }

  /**
   * Get autoremediado distribution (pie chart data) using aggregation
   */
  async getAutoremediadoDistribution(filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          conAutoremediado: {
            $sum: {
              $cond: [
                { $eq: ['$Autoremediado', true] },
                1,
                {
                  $cond: [
                    {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: { $ifNull: ['$recentComments.comments', []] },
                              cond: {
                                $regexMatch: {
                                  input: { $toLower: '$$this.content' },
                                  regex: 'github actions'
                                }
                              }
                            }
                          }
                        },
                        0
                      ]
                    },
                    1,
                    0
                  ]
                }
              ]
            }
          },
          total: { $sum: 1 }
        }
      }
    ];

    const [result] = await collection.aggregate(pipeline).toArray();

    const conAutoremediado = result?.conAutoremediado || 0;
    const total = result?.total || 0;
    const sinAutoremediado = total - conAutoremediado;

    const data = [
      { name: 'Sí', value: conAutoremediado },
      { name: 'No', value: sinAutoremediado },
    ];

    return { data };
  }

  /**
   * Get autoremediation time series data using aggregation
   */
  async getAutoremediationTimeSeries(granularity: 'day' | 'week' | 'month' = 'day', filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    // Build date format based on granularity
    let dateFormat: string;
    if (granularity === 'day') {
      dateFormat = '%Y-%m-%d';
    } else if (granularity === 'week') {
      dateFormat = '%Y-W%V';
    } else {
      dateFormat = '%Y-%m';
    }

    // Match auto-remediated problems
    const autoRemediatedMatch = {
      ...match,
      $or: [
        { Autoremediado: true },
        { 'recentComments.comments.content': { $regex: 'github actions', $options: 'i' } }
      ]
    };

    const pipeline = [
      { $match: autoRemediatedMatch },
      {
        $addFields: {
          parsedDate: {
            $cond: {
              if: { $eq: [{ $type: '$startTime' }, 'string'] },
              then: { $dateFromString: { dateString: '$startTime', onError: new Date() } },
              else: '$startTime'
            }
          }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$parsedDate' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          timestamp: '$_id',
          count: 1
        }
      }
    ];

    const data = await collection.aggregate(pipeline).toArray();

    return { data };
  }

  /**
   * Get average resolution time series data using aggregation
   */
  async getAverageResolutionTimeTimeSeries(granularity: 'day' | 'week' | 'month' = 'day', filters?: ProblemFilters) {
    const collection = this.getCollection();
    const match = this.buildMatchStage(filters);

    // Build date format based on granularity
    let dateFormat: string;
    if (granularity === 'day') {
      dateFormat = '%Y-%m-%d';
    } else if (granularity === 'week') {
      dateFormat = '%Y-W%V';
    } else {
      dateFormat = '%Y-%m';
    }

    const pipeline = [
      { $match: { ...match, status: 'CLOSED' } },
      {
        $addFields: {
          parsedDate: {
            $cond: {
              if: { $eq: [{ $type: '$startTime' }, 'string'] },
              then: { $dateFromString: { dateString: '$startTime', onError: new Date() } },
              else: '$startTime'
            }
          }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$parsedDate' } },
          avgResolutionTime: { $avg: { $ifNull: ['$duration', 0] } }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          timestamp: '$_id',
          avgResolutionTime: { $round: ['$avgResolutionTime', 0] }
        }
      }
    ];

    const data = await collection.aggregate(pipeline).toArray();

    return { data };
  }
}
