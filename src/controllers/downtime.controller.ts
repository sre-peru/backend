/**
 * Downtime Controller - Handle downtime analytics requests
 */
import { Request, Response } from 'express';
import { downtimeService } from '../services/downtime.service';

export class DowntimeController {
  /**
   * GET /api/analytics/downtime
   * Get downtime statistics for a date range
   */
  async getDowntimeStats(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      console.log('📊 Downtime request received:', { startDate, endDate });

      // Validate required parameters
      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Missing required parameters',
          message: 'Both startDate and endDate are required'
        });
        return;
      }

      // Validate date format
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({
          error: 'Invalid date format',
          message: 'Dates must be in ISO 8601 format (YYYY-MM-DD)'
        });
        return;
      }

      // Get downtime statistics
      const stats = await downtimeService.getDowntimeStats(
        startDate as string,
        endDate as string
      );

      console.log('✅ Downtime stats calculated:', {
        totalProblems: stats.totalProblems,
        totalHours: stats.totalHours,
        monthsCount: stats.monthlySummary.length
      });

      res.json(stats);
    } catch (error) {
      console.error('❌ Error getting downtime stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const downtimeController = new DowntimeController();
