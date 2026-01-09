/**
 * Filter Utilities
 */
import { ProblemFilters } from '../types/problem.types';

/**
 * Parse filters from query parameters
 */
export const parseFilters = (query: any): ProblemFilters => {
  const filters: ProblemFilters = {};

  // Parse array filters
  if (query.impactLevel) {
    filters.impactLevel = Array.isArray(query.impactLevel) 
      ? query.impactLevel 
      : [query.impactLevel];
  }

  if (query.severityLevel) {
    filters.severityLevel = Array.isArray(query.severityLevel) 
      ? query.severityLevel 
      : [query.severityLevel];
  }

  if (query.status) {
    filters.status = Array.isArray(query.status) 
      ? query.status 
      : [query.status];
  }

  if (query.managementZones) {
    filters.managementZones = Array.isArray(query.managementZones) 
      ? query.managementZones 
      : [query.managementZones];
  }

  if (query.affectedEntityTypes) {
    filters.affectedEntityTypes = Array.isArray(query.affectedEntityTypes) 
      ? query.affectedEntityTypes 
      : [query.affectedEntityTypes];
  }

  if (query.entityTags) {
    filters.entityTags = Array.isArray(query.entityTags) 
      ? query.entityTags 
      : [query.entityTags];
  }

  if (query.evidenceType) {
    filters.evidenceType = Array.isArray(query.evidenceType) 
      ? query.evidenceType 
      : [query.evidenceType];
  }

  // Parse string filters
  if (query.dateFrom) {
    filters.dateFrom = query.dateFrom as string;
  }

  if (query.dateTo) {
    filters.dateTo = query.dateTo as string;
  }

  if (query.search) {
    filters.search = query.search as string;
  }

  // Parse number filters
  if (query.durationMin) {
    filters.durationMin = Number(query.durationMin);
  }

  if (query.durationMax) {
    filters.durationMax = Number(query.durationMax);
  }

  // Parse boolean filters
  if (query.hasComments !== undefined) {
    filters.hasComments = query.hasComments === 'true' || query.hasComments === true;
  }

  if (query.hasGitHubActions !== undefined) {
    filters.hasGitHubActions = query.hasGitHubActions === 'true' || query.hasGitHubActions === true;
  }

  if (query.hasRootCause !== undefined) {
    if (query.hasRootCause === 'true' || query.hasRootCause === true) {
      filters.hasRootCause = true;
    } else if (query.hasRootCause === 'false' || query.hasRootCause === false) {
      filters.hasRootCause = false;
    } else {
      filters.hasRootCause = null;
    }
  }

  if (query.autoremediado !== undefined) {
    if (query.autoremediado === 'true' || query.autoremediado === true) {
      filters.autoremediado = true;
    } else if (query.autoremediado === 'false' || query.autoremediado === false) {
      filters.autoremediado = false;
    } else {
      filters.autoremediado = null;
    }
  }

  if (query.funcionoAutoRemediacion !== undefined) {
    if (query.funcionoAutoRemediacion === 'true' || query.funcionoAutoRemediacion === true) {
      filters.funcionoAutoRemediacion = true;
    } else if (query.funcionoAutoRemediacion === 'false' || query.funcionoAutoRemediacion === false) {
      filters.funcionoAutoRemediacion = false;
    } else {
      filters.funcionoAutoRemediacion = null;
    }
  }

  return filters;
};
