/**
 * Problem Controller
 */
import { Request, Response, NextFunction } from 'express';
import { ProblemService } from '../services/problem.service';
import { sendSuccess, sendError } from '../utils/response.utils';
import { parseFilters } from '../utils/filter.utils';

// Lazy initialization to ensure database is connected first
let problemService: ProblemService;
const getProblemService = () => {
  if (!problemService) {
    problemService = new ProblemService();
  }
  return problemService;
};

/**
 * Get all problems with filters and pagination
 */
export const getProblems = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'startTime',
      sortOrder = 'desc',
      ...queryFilters
    } = req.query;

    // Parse filters from query params
    const filters = parseFilters(queryFilters);

    const result = await getProblemService().getProblems(
      filters,
      Number(page),
      Number(limit),
      sortBy as string,
      sortOrder as 'asc' | 'desc'
    );

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get problem by ID
 */
export const getProblemById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { problemId } = req.params;
    const problem = await getProblemService().getProblemById(problemId);
    sendSuccess(res, { problem });
  } catch (error) {
    if (error instanceof Error && error.message === 'Problem not found') {
      sendError(res, 'NOT_FOUND', 'Problem not found', 404);
    } else {
      next(error);
    }
  }
};

/**
 * Update problem status
 */
export const updateProblemStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { problemId } = req.params;
    const { status } = req.body;

    const problem = await getProblemService().updateProblemStatus(problemId, status);
    sendSuccess(res, { problem }, 'Status updated successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Problem not found') {
      sendError(res, 'NOT_FOUND', 'Problem not found', 404);
    } else {
      next(error);
    }
  }
};

/**
 * Add comment to problem
 */
export const addComment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { problemId } = req.params;
    const { content } = req.body;
    const authorName = req.user?.username || 'Anonymous';

    const problem = await getProblemService().addComment(problemId, content, authorName);
    sendSuccess(res, { problem }, 'Comment added successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Problem not found') {
      sendError(res, 'NOT_FOUND', 'Problem not found', 404);
    } else {
      next(error);
    }
  }
};

/**
 * Get filter options
 */
export const getFilterOptions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const options = await getProblemService().getFilterOptions();
    sendSuccess(res, options);
  } catch (error) {
    next(error);
  }
};
