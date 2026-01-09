/**
 * Problem Repository - Data Access Layer
 */
import { Collection, Filter, Sort } from 'mongodb';
import { database } from '../config/database';
import { Problem, ProblemFilters, PaginatedProblemsResponse } from '../types/problem.types';

export class ProblemRepository {
  private collection: Collection;

  constructor() {
    this.collection = database.getCollection();
  }

  /**
   * Build MongoDB filter from ProblemFilters
   */
  private buildFilter(filters: ProblemFilters): Filter<any> {
    const mongoFilter: Filter<any> = {};

    // Impact Level filter
    if (filters.impactLevel && filters.impactLevel.length > 0) {
      mongoFilter.impactLevel = { $in: filters.impactLevel };
    }

    // Severity Level filter
    if (filters.severityLevel && filters.severityLevel.length > 0) {
      mongoFilter.severityLevel = { $in: filters.severityLevel };
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      mongoFilter.status = { $in: filters.status };
    }

    // Management Zones filter
    if (filters.managementZones && filters.managementZones.length > 0) {
      mongoFilter['managementZones.name'] = { $in: filters.managementZones };
    }

    // Affected Entity Types filter
    if (filters.affectedEntityTypes && filters.affectedEntityTypes.length > 0) {
      mongoFilter['affectedEntities.entityId.type'] = { $in: filters.affectedEntityTypes };
    }

    // Entity Tags filter
    if (filters.entityTags && filters.entityTags.length > 0) {
      mongoFilter['entityTags.stringRepresentation'] = { $in: filters.entityTags };
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      mongoFilter.startTime = {};
      if (filters.dateFrom) {
        mongoFilter.startTime.$gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        mongoFilter.startTime.$lte = filters.dateTo;
      }
    }

    // Has comments filter
    if (filters.hasComments !== undefined) {
      if (filters.hasComments) {
        mongoFilter['recentComments.totalCount'] = { $gt: 0 };
      } else {
        mongoFilter['recentComments.totalCount'] = 0;
      }
    }

    // GitHub Actions filter
    if (filters.hasGitHubActions) {
      mongoFilter['recentComments.comments.content'] = { $regex: 'GitHub Actions', $options: 'i' };
    }

    // Evidence Type filter
    if (filters.evidenceType && filters.evidenceType.length > 0) {
      mongoFilter['evidenceDetails.details.evidenceType'] = { $in: filters.evidenceType };
    }

    // Text search filter
    if (filters.search) {
      mongoFilter.$text = { $search: filters.search };
    }

    // Root Cause filter
    if (filters.hasRootCause !== undefined && filters.hasRootCause !== null) {
      if (filters.hasRootCause) {
        mongoFilter.rootCauseEntity = { $ne: null, $exists: true };
      } else {
        mongoFilter.$or = [
          { rootCauseEntity: null },
          { rootCauseEntity: { $exists: false } }
        ];
      }
    }

    // Duration filter (using duration field from DB)
    if (filters.durationMin !== undefined || filters.durationMax !== undefined) {
      mongoFilter.duration = {};
      if (filters.durationMin !== undefined) {
        mongoFilter.duration.$gte = filters.durationMin;
      }
      if (filters.durationMax !== undefined) {
        mongoFilter.duration.$lte = filters.durationMax;
      }
    }

    // Autoremediado filter
    if (filters.autoremediado !== undefined && filters.autoremediado !== null) {
      mongoFilter.autoremediado = filters.autoremediado;
    }

    // FuncionoAutoRemediacion filter
    if (filters.funcionoAutoRemediacion !== undefined && filters.funcionoAutoRemediacion !== null) {
      mongoFilter.funcionoAutoRemediacion = filters.funcionoAutoRemediacion;
    }

    return mongoFilter;
  }

  /**
   * Get paginated problems with filters
   */
  async findAll(
    filters: ProblemFilters,
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'startTime',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<PaginatedProblemsResponse> {
    const mongoFilter = this.buildFilter(filters);
    const skip = (page - 1) * limit;
    const sort: Sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [problems, total] = await Promise.all([
      this.collection
        .find(mongoFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray() as unknown as Promise<Problem[]>,
      this.collection.countDocuments(mongoFilter),
    ]);

    return {
      problems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find problem by ID
   */
  async findById(problemId: string): Promise<Problem | null> {
    const problem = await this.collection.findOne({ problemId }) as Problem | null;
    return problem;
  }

  /**
   * Get all problems (for analytics)
   * Optimized with projection to only fetch needed fields
   */
  async findAllProblems(filters?: ProblemFilters, limit?: number): Promise<Problem[]> {
    const mongoFilter = filters ? this.buildFilter(filters) : {};
    
    // Projection to only fetch fields needed for analytics
    const projection = {
      problemId: 1,
      displayId: 1,
      title: 1,
      impactLevel: 1,
      severityLevel: 1,
      status: 1,
      startTime: 1,
      endTime: 1,
      duration: 1,
      rootCauseEntity: 1,
      'managementZones.name': 1,
      'affectedEntities.entityId.type': 1,
      'evidenceDetails.details.evidenceType': 1,
      'recentComments.totalCount': 1,
      'recentComments.comments': 1,
    };

    let query = this.collection.find(mongoFilter, { projection });
    
    // Apply limit if provided (default to 10000 for analytics)
    if (limit) {
      query = query.limit(limit);
    } else {
      query = query.limit(10000);
    }
    
    const problems = await query.toArray() as unknown as Problem[];
    return problems;
  }

  /**
   * Update problem status
   */
  async updateStatus(problemId: string, status: 'OPEN' | 'CLOSED'): Promise<Problem | null> {
    const result = await this.collection.findOneAndUpdate(
      { problemId },
      { $set: { status } },
      { returnDocument: 'after' }
    );
    return result as Problem | null;
  }

  /**
   * Add comment to problem
   */
  async addComment(problemId: string, comment: any): Promise<Problem | null> {
    const result = await this.collection.findOneAndUpdate(
      { problemId },
      {
        $push: { 'recentComments.comments': comment },
        $inc: { 'recentComments.totalCount': 1 },
      },
      { returnDocument: 'after' }
    );
    return result as Problem | null;
  }

  /**
   * Get distinct values for filters
   */
  async getDistinctValues(field: string): Promise<string[]> {
    const values = await this.collection.distinct(field);
    return values.filter(v => v !== null && v !== undefined);
  }

  /**
   * Get filter options
   */
  async getFilterOptions() {
    const [
      impactLevels,
      severityLevels,
      statuses,
      managementZones,
      entityTypes,
      evidenceTypes,
    ] = await Promise.all([
      this.getDistinctValues('impactLevel'),
      this.getDistinctValues('severityLevel'),
      this.getDistinctValues('status'),
      this.getDistinctValues('managementZones.name'),
      this.getDistinctValues('affectedEntities.entityId.type'),
      this.getDistinctValues('evidenceDetails.details.evidenceType'),
    ]);

    // Get all unique tags
    const allProblems = await this.collection.find({}, { projection: { entityTags: 1 } }).toArray();
    const tags = new Set<string>();
    allProblems.forEach(problem => {
      problem.entityTags?.forEach((tag: any) => {
        if (tag.stringRepresentation) {
          tags.add(tag.stringRepresentation);
        }
      });
    });

    return {
      impactLevels,
      severityLevels,
      statuses,
      managementZones,
      entityTypes,
      evidenceTypes,
      tags: Array.from(tags),
    };
  }
}
