/**
 * Analytics Service - Business Logic for Analytics
 */
import { ProblemRepository } from '../repositories/problem.repository';
import { DashboardKPIs, ProblemFilters } from '../types/problem.types';

export class AnalyticsService {
  private repository: ProblemRepository;

  constructor() {
    this.repository = new ProblemRepository();
  }

  /**
   * Calculate Dashboard KPIs
   */
  async getKPIs(filters?: ProblemFilters): Promise<DashboardKPIs> {
    const problems = await this.repository.findAllProblems(filters);

    const totalProblems = problems.length;
    const openProblems = problems.filter(p => p.status === 'OPEN').length;
    const closedProblems = problems.filter(p => p.status === 'CLOSED').length;

    // Calculate total duration and average resolution time
    let totalDuration = 0;
    let resolutionTimes: number[] = [];

    problems.forEach(problem => {
      const duration = problem.duration || 0; // Use duration from DB
      totalDuration += duration;

      if (problem.status === 'CLOSED') {
        resolutionTimes.push(duration);
      }
    });

    const avgResolutionTime = resolutionTimes.length > 0
      ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
      : 0;

    // Problems with comments
    const problemsWithComments = problems.filter(
      p => p.recentComments.totalCount > 0
    ).length;

    // Problems with GitHub Actions in comments
    const githubActionProblems = problems.filter(p =>
      p.recentComments.comments && p.recentComments.comments.some(comment =>
        comment.content.toLowerCase().includes('github actions')
      )
    ).length;

    // Critical problems (AVAILABILITY or ERROR severity)
    const criticalProblems = problems.filter(
      p => p.severityLevel === 'AVAILABILITY' || p.severityLevel === 'ERROR'
    ).length;

    return {
      totalProblems,
      openProblems,
      closedProblems,
      totalDuration,
      avgResolutionTime,
      problemsWithComments,
      githubActionProblems,
      criticalProblems,
    };
  }

  /**
   * Get time series data for problems
   */
  async getTimeSeries(granularity: 'day' | 'week' | 'month' = 'day', filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    // Group problems by time and severity
    const timeSeriesMap = new Map<string, Record<string, number>>();

    problems.forEach(problem => {
      const date = new Date(problem.startTime);
      let key: string;

      if (granularity === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (granularity === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!timeSeriesMap.has(key)) {
        timeSeriesMap.set(key, {});
      }

      const severityBreakdown = timeSeriesMap.get(key)!;
      severityBreakdown[problem.severityLevel] = (severityBreakdown[problem.severityLevel] || 0) + 1;
    });

    // Convert to array and sort by timestamp
    const data = Array.from(timeSeriesMap.entries())
      .map(([timestamp, severityBreakdown]) => ({
        timestamp,
        severityBreakdown,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { data };
  }

  /**
   * Get impact vs severity matrix
   */
  async getImpactSeverityMatrix(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const matrix: Record<string, Record<string, number>> = {};

    problems.forEach(problem => {
      if (!matrix[problem.impactLevel]) {
        matrix[problem.impactLevel] = {};
      }
      matrix[problem.impactLevel][problem.severityLevel] =
        (matrix[problem.impactLevel][problem.severityLevel] || 0) + 1;
    });

    return { matrix };
  }

  /**
   * Get top affected entities
   */
  async getTopEntities(limit: number = 10, filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const entityMap = new Map<string, { name: string; type: string; count: number }>();

    problems.forEach(problem => {
      problem.affectedEntities.forEach(entity => {
        const key = entity.entityId.id;
        if (entityMap.has(key)) {
          entityMap.get(key)!.count++;
        } else {
          entityMap.set(key, {
            name: entity.name,
            type: entity.entityId.type,
            count: 1,
          });
        }
      });
    });

    const entities = Array.from(entityMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(entity => ({
        name: entity.name,
        type: entity.type,
        problemCount: entity.count,
      }));

    return { entities };
  }

  /**
   * Get management zones analysis
   */
  async getManagementZones(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const zoneMap = new Map<string, { count: number; severities: string[] }>();

    problems.forEach(problem => {
      problem.managementZones.forEach(zone => {
        if (zoneMap.has(zone.name)) {
          const data = zoneMap.get(zone.name)!;
          data.count++;
          data.severities.push(problem.severityLevel);
        } else {
          zoneMap.set(zone.name, {
            count: 1,
            severities: [problem.severityLevel],
          });
        }
      });
    });

    const severityWeights = {
      AVAILABILITY: 5,
      ERROR: 4,
      PERFORMANCE: 3,
      RESOURCE_CONTENTION: 2,
      CUSTOM_ALERT: 1,
    };

    const zones = Array.from(zoneMap.entries()).map(([name, data]) => {
      const avgSeverity =
        data.severities.reduce((sum, sev) => sum + (severityWeights[sev as keyof typeof severityWeights] || 0), 0) /
        data.severities.length;

      return {
        name,
        problemCount: data.count,
        avgSeverity: Number(avgSeverity.toFixed(2)),
      };
    });

    return { zones };
  }

  /**
   * Get remediation funnel
   */
  async getRemediationFunnel(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const totalProblems = problems.length;
    const problemsWithComments = problems.filter(p => p.recentComments.totalCount > 0);
    const problemsWithGitHubActions = problemsWithComments.filter(p =>
      p.recentComments.comments && p.recentComments.comments.some(c => c.content.toLowerCase().includes('github actions'))
    );
    const problemsWithSuccess = problemsWithGitHubActions.filter(p =>
      p.recentComments.comments && p.recentComments.comments.some(c =>
        c.content.toLowerCase().includes('success') || c.content.toLowerCase().includes('completed')
      )
    );
    const closedProblems = problems.filter(p => p.status === 'CLOSED');

    const stages = [
      {
        name: 'Total Problems',
        count: totalProblems,
        percentage: 100,
      },
      {
        name: 'With Comments',
        count: problemsWithComments.length,
        percentage: Number(((problemsWithComments.length / totalProblems) * 100).toFixed(2)),
      },
      {
        name: 'GitHub Actions Initiated',
        count: problemsWithGitHubActions.length,
        percentage: Number(((problemsWithGitHubActions.length / totalProblems) * 100).toFixed(2)),
      },
      {
        name: 'Remediation Successful',
        count: problemsWithSuccess.length,
        percentage: Number(((problemsWithSuccess.length / totalProblems) * 100).toFixed(2)),
      },
      {
        name: 'Closed',
        count: closedProblems.length,
        percentage: Number(((closedProblems.length / totalProblems) * 100).toFixed(2)),
      },
    ];

    return { stages };
  }

  /**
   * Get duration distribution
   */
  async getDurationDistribution(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const categories = {
      'less_than_5': 0,
      '5_to_10': 0,
      '10_to_30': 0,
      '30_to_180': 0,
      'more_than_180': 0,
    };

    problems.forEach(problem => {
      const duration = problem.duration || 0; // Use duration from DB

      if (duration < 5) {
        categories.less_than_5++;
      } else if (duration < 10) {
        categories['5_to_10']++;
      } else if (duration < 30) {
        categories['10_to_30']++;
      } else if (duration < 180) {
        categories['30_to_180']++;
      } else {
        categories.more_than_180++;
      }
    });

    return { categories };
  }

  /**
   * Get evidence types breakdown
   */
  async getEvidenceTypes(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const evidenceMap = new Map<string, Map<string, number>>();

    problems.forEach(problem => {
      problem.evidenceDetails.details.forEach(evidence => {
        if (!evidenceMap.has(evidence.evidenceType)) {
          evidenceMap.set(evidence.evidenceType, new Map());
        }

        const eventTypeMap = evidenceMap.get(evidence.evidenceType)!;
        const eventType = evidence.eventType || 'UNKNOWN';
        eventTypeMap.set(eventType, (eventTypeMap.get(eventType) || 0) + 1);
      });
    });

    const breakdown: any[] = [];
    evidenceMap.forEach((eventTypes, evidenceType) => {
      const children: any[] = [];
      eventTypes.forEach((count, eventType) => {
        children.push({ name: eventType, value: count });
      });
      breakdown.push({
        name: evidenceType,
        children,
      });
    });

    return { breakdown };
  }

  /**
   * Get root cause entity analysis (treemap data)
   */
  async getRootCauseAnalysis(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const rootCauseMap = new Map<string, number>();

    problems.forEach(problem => {
      if (problem.rootCauseEntity && problem.rootCauseEntity.name) {
        const name = problem.rootCauseEntity.name;
        rootCauseMap.set(name, (rootCauseMap.get(name) || 0) + 1);
      }
    });

    const data = Array.from(rootCauseMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { data };
  }

  /**
   * Get root cause distribution (pie chart data)
   */
  async getRootCauseDistribution(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const withRootCause = problems.filter(p => p.rootCauseEntity !== null && p.rootCauseEntity !== undefined).length;
    const withoutRootCause = problems.length - withRootCause;

    const data = [
      { name: 'With Root Cause', value: withRootCause },
      { name: 'Without Root Cause', value: withoutRootCause },
    ];

    return { data };
  }

  /**
   * Get impact level distribution (doughnut chart data)
   */
  async getImpactDistribution(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const distribution: Record<string, number> = {};

    problems.forEach(problem => {
      const impact = problem.impactLevel;
      distribution[impact] = (distribution[impact] || 0) + 1;
    });

    const data = Object.entries(distribution).map(([name, value]) => ({
      name,
      value,
    }));

    return { data };
  }

  /**
   * Get severity level distribution (doughnut chart data)
   */
  async getSeverityDistribution(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const distribution: Record<string, number> = {};

    problems.forEach(problem => {
      const severity = problem.severityLevel;
      distribution[severity] = (distribution[severity] || 0) + 1;
    });

    const data = Object.entries(distribution).map(([name, value]) => ({
      name,
      value,
    }));

    return { data };
  }

  /**
   * Get root cause existence distribution (doughnut chart data)
   */
  async getHasRootCauseDistribution(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const withRootCause = problems.filter(p => 
      p.rootCauseEntity !== null && 
      p.rootCauseEntity !== undefined &&
      Object.keys(p.rootCauseEntity).length > 0
    ).length;
    const withoutRootCause = problems.length - withRootCause;

    const data = [
      { name: 'Sí', value: withRootCause },
      { name: 'No', value: withoutRootCause },
    ];

    return { data };
  }

  /**
   * Get autoremediado distribution (pie chart data)
   */
  async getAutoremediadoDistribution(filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);

    const conAutoremediado = problems.filter(p =>
      p.recentComments.comments && p.recentComments.comments.some(comment =>
        comment.content.toLowerCase().includes('github actions')
      )
    ).length;
    const sinAutoremediado = problems.length - conAutoremediado;

    const data = [
      { name: 'Sí', value: conAutoremediado },
      { name: 'No', value: sinAutoremediado },
    ];

    return { data };
  }

  /**
   * Get autoremediation time series data
   */
  async getAutoremediationTimeSeries(granularity: 'day' | 'week' | 'month' = 'day', filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);
    const autoremediatedProblems = problems.filter(p =>
      p.recentComments.comments && p.recentComments.comments.some(comment =>
        comment.content.toLowerCase().includes('github actions')
      )
    );

    const timeSeriesMap = new Map<string, number>();

    autoremediatedProblems.forEach(problem => {
      const date = new Date(problem.startTime);
      let key: string;

      if (granularity === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (granularity === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      timeSeriesMap.set(key, (timeSeriesMap.get(key) || 0) + 1);
    });

    const data = Array.from(timeSeriesMap.entries())
      .map(([timestamp, count]) => ({ timestamp, count }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { data };
  }

  /**
   * Get average resolution time series data
   */
  async getAverageResolutionTimeTimeSeries(granularity: 'day' | 'week' | 'month' = 'day', filters?: ProblemFilters) {
    const problems = await this.repository.findAllProblems(filters);
    const closedProblems = problems.filter(p => p.status === 'CLOSED');

    const timeSeriesMap = new Map<string, { totalDuration: number; count: number }>();

    closedProblems.forEach(problem => {
      const date = new Date(problem.startTime);
      let key: string;

      if (granularity === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (granularity === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!timeSeriesMap.has(key)) {
        timeSeriesMap.set(key, { totalDuration: 0, count: 0 });
      }

      const entry = timeSeriesMap.get(key)!;
      entry.totalDuration += problem.duration || 0;
      entry.count++;
    });

    const data = Array.from(timeSeriesMap.entries())
      .map(([timestamp, { totalDuration, count }]) => ({
        timestamp,
        avgResolutionTime: count > 0 ? Math.round(totalDuration / count) : 0,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return { data };
  }
}
