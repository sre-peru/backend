/**
 * Downtime Service - Calculate Real Downtime Hours
 * Filters false positives and calculates accurate downtime metrics
 */
import { Collection } from 'mongodb';
import { database } from '../config/database';

interface Problem {
  problemId: string;
  title: string;
  displayName?: string;
  severityLevel: string;
  startTime: Date | string;
  endTime: Date | string;
  duration: number;
  affectedEntities?: Array<{ name: string }>;
  impactMetrics?: {
    errorRate?: number;
    latency?: number;
  };
}

interface SeverityStats {
  count: number;
  hours: number;
}

interface MonthlySummary {
  month: string;
  problems: number;
  hours: number;
  downtimePercent: number;
  bySeverity: Record<string, SeverityStats>;
}

interface TopProblem {
  title: string;
  severity: string;
  durationHours: number;
  startTime: string;
  affectedService: string;
}

export interface DowntimeStats {
  totalProblems: number;
  totalHours: number;
  downtimePercent: number;
  monthlySummary: MonthlySummary[];
  severityDistribution: Record<string, SeverityStats>;
  topProblems: TopProblem[];
}

export class DowntimeService {
  private getCollection(): Collection {
    return database.getCollection();
  }

  /**
   * Check if a problem is a false positive
   */
  private isValidProblem(problem: Problem): boolean {
    const startTime = new Date(problem.startTime).getTime();
    const endTime = new Date(problem.endTime).getTime();
    const durationMs = endTime - startTime;

    // 1. Duration < 1 minute
    if (durationMs < 60000) return false;

    // 2. Health checks, pings, synthetic tests
    const name = (problem.title || problem.displayName || '').toLowerCase();
    if (/health|ping|status|synthetic|probe/.test(name)) return false;

    // 3. Low impact (unless very long duration)
    if (problem.impactMetrics) {
      const errorRate = problem.impactMetrics.errorRate || 0;
      const latency = problem.impactMetrics.latency || 0;
      const isLowImpact = errorRate < 0.1 && latency < 100;
      const isLongDuration = durationMs > 300000; // 5 minutes

      if (isLowImpact && !isLongDuration) return false;
    }

    // 4. CRITICAL/AVAILABILITY very short
    if (['AVAILABILITY', 'CRITICAL'].includes(problem.severityLevel) && durationMs < 30000) {
      return false;
    }

    return true;
  }

  /**
   * Calculate duration in hours
   */
  private calculateDurationHours(startTime: Date | string, endTime: Date | string): number {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return (end - start) / 3600000; // Convert ms to hours
  }

  /**
   * Get month key from date (YYYY-MM format)
   */
  private getMonthKey(date: Date | string): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Get total hours in a month
   */
  private getMonthHours(monthKey: string): number {
    const [year, month] = monthKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return daysInMonth * 24;
  }

  /**
   * Get downtime statistics for a date range
   */
  async getDowntimeStats(startDate: string, endDate: string): Promise<DowntimeStats> {
    const collection = this.getCollection();

    console.log('🔍 Fetching problems from MongoDB:', { startDate, endDate });

    // Fetch problems in date range - using string comparison for MongoDB dates
    const problems = await collection.find({
      $or: [
        {
          startTime: {
            $gte: startDate,
            $lt: endDate
          }
        },
        {
          startTime: {
            $gte: new Date(startDate),
            $lt: new Date(endDate)
          }
        }
      ]
    }).toArray() as unknown as Problem[];

    console.log(`📥 Fetched ${problems.length} problems from database`);

    // Filter valid problems (remove false positives)
    const validProblems = problems.filter(p => this.isValidProblem(p));

    console.log(`✅ ${validProblems.length} valid problems after filtering (removed ${problems.length - validProblems.length} false positives)`);

    // Initialize aggregation structures
    const monthlyData: Record<string, {
      problems: number;
      hours: number;
      bySeverity: Record<string, SeverityStats>;
    }> = {};

    const severityData: Record<string, SeverityStats> = {};
    const allProblemsWithHours: Array<Problem & { durationHours: number }> = [];

    let totalHours = 0;

    // Process each valid problem using REAL calculation: (endTime - startTime) / 3600000
    for (const problem of validProblems) {
      // Parse dates - handle both Date objects and ISO strings
      const startTime = typeof problem.startTime === 'string' 
        ? new Date(problem.startTime).getTime()
        : problem.startTime.getTime();
      
      const endTime = typeof problem.endTime === 'string'
        ? new Date(problem.endTime).getTime()
        : problem.endTime.getTime();

      // REAL CALCULATION: (endTime - startTime) / 3600000
      const durationHours = (endTime - startTime) / 3600000;
      
      const monthKey = this.getMonthKey(problem.startTime);
      const severity = problem.severityLevel;

      totalHours += durationHours;

      // Monthly aggregation
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          problems: 0,
          hours: 0,
          bySeverity: {}
        };
      }
      monthlyData[monthKey].problems++;
      monthlyData[monthKey].hours += durationHours;

      if (!monthlyData[monthKey].bySeverity[severity]) {
        monthlyData[monthKey].bySeverity[severity] = { count: 0, hours: 0 };
      }
      monthlyData[monthKey].bySeverity[severity].count++;
      monthlyData[monthKey].bySeverity[severity].hours += durationHours;

      // Severity aggregation
      if (!severityData[severity]) {
        severityData[severity] = { count: 0, hours: 0 };
      }
      severityData[severity].count++;
      severityData[severity].hours += durationHours;

      // Store for top problems
      allProblemsWithHours.push({ ...problem, durationHours });
    }

    // Build monthly summary
    const monthlySummary: MonthlySummary[] = Object.keys(monthlyData)
      .sort()
      .map(monthKey => {
        const data = monthlyData[monthKey];
        const monthHours = this.getMonthHours(monthKey);
        const downtimePercent = (data.hours / monthHours) * 100;

        return {
          month: monthKey,
          problems: data.problems,
          hours: Number(data.hours.toFixed(2)),
          downtimePercent: Number(downtimePercent.toFixed(3)),
          bySeverity: Object.fromEntries(
            Object.entries(data.bySeverity).map(([sev, stats]) => [
              sev,
              {
                count: stats.count,
                hours: Number(stats.hours.toFixed(2))
              }
            ])
          )
        };
      });

    // Get top 10 longest problems
    const topProblems: TopProblem[] = allProblemsWithHours
      .sort((a, b) => b.durationHours - a.durationHours)
      .slice(0, 10)
      .map(p => ({
        title: p.title || p.displayName || 'Unknown',
        severity: p.severityLevel,
        durationHours: Number(p.durationHours.toFixed(2)),
        startTime: new Date(p.startTime).toISOString(),
        affectedService: p.affectedEntities?.[0]?.name || 'Unknown'
      }));

    // Calculate overall downtime percentage
    const totalMonthHours = monthlySummary.reduce((sum, m) => sum + this.getMonthHours(m.month), 0);
    const downtimePercent = totalMonthHours > 0 ? (totalHours / totalMonthHours) * 100 : 0;

    // Format severity distribution
    const severityDistribution = Object.fromEntries(
      Object.entries(severityData).map(([sev, stats]) => [
        sev,
        {
          count: stats.count,
          hours: Number(stats.hours.toFixed(2))
        }
      ])
    );

    return {
      totalProblems: validProblems.length,
      totalHours: Number(totalHours.toFixed(2)),
      downtimePercent: Number(downtimePercent.toFixed(3)),
      monthlySummary,
      severityDistribution,
      topProblems
    };
  }
}

export const downtimeService = new DowntimeService();
