/**
 * Core type definitions for Dynatrace Problems
 */

export interface EntityId {
  id: string;
  type: string;
}

export interface Entity {
  entityId: EntityId;
  name: string;
}

export interface ManagementZone {
  id: string;
  name: string;
}

export interface EntityTag {
  context: string;
  key: string;
  value?: string;
  stringRepresentation: string;
}

export interface EvidenceDetail {
  evidenceType: 'EVENT' | 'METRIC' | 'TRANSACTIONAL' | 'MAINTENANCE_WINDOW';
  displayName: string;
  entity: Entity;
  groupingEntity: Entity;
  rootCauseRelevant: boolean;
  eventId: string;
  eventType: string;
  data: {
    properties: Array<{
      key: string;
      value: string;
    }>;
    [key: string]: any;
  };
  startTime: string;
  endTime: string;
}

export interface EvidenceDetails {
  totalCount: number;
  details: EvidenceDetail[];
}

export interface Comment {
  id: string;
  createdAtTimestamp: string | number;
  content: string;
  authorName: string;
  context: string;
}

export interface RecentComments {
  totalCount: number;
  comments: Comment[];
}

export interface ImpactAnalysis {
  impacts?: Array<{
    impactType: string;
    estimatedAffectedUsers?: number;
    numberOfPotentiallyAffectedServiceCalls?: number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

export type ImpactLevel = 'INFRASTRUCTURE' | 'SERVICES' | 'APPLICATION' | 'ENVIRONMENT';
export type SeverityLevel = 'AVAILABILITY' | 'ERROR' | 'PERFORMANCE' | 'RESOURCE_CONTENTION' | 'CUSTOM_ALERT';
export type ProblemStatus = 'OPEN' | 'CLOSED';

export interface Problem {
  _id?: string;
  problemId: string;
  displayId: string;
  title: string;
  impactLevel: ImpactLevel;
  severityLevel: SeverityLevel;
  status: ProblemStatus;
  affectedEntities: Entity[];
  impactedEntities: Entity[];
  rootCauseEntity: Entity | null;
  managementZones: ManagementZone[];
  entityTags: EntityTag[];
  problemFilters: string[];
  startTime: string;
  endTime: string;
  duration: number; // Duration in minutes
  evidenceDetails: EvidenceDetails;
  recentComments: RecentComments;
  impactAnalysis: ImpactAnalysis;
}

export interface ProblemFilters {
  impactLevel?: ImpactLevel[];
  severityLevel?: SeverityLevel[];
  status?: ProblemStatus[];
  managementZones?: string[];
  affectedEntityTypes?: string[];
  entityTags?: string[];
  dateFrom?: string;
  dateTo?: string;
  durationMin?: number;
  durationMax?: number;
  hasComments?: boolean;
  hasGitHubActions?: boolean;
  evidenceType?: string[];
  search?: string;
  hasRootCause?: boolean | null; // null = all, true = has root cause, false = no root cause
  autoremediado?: boolean | null;
  funcionoAutoRemediacion?: boolean | null;
}

export interface PaginatedProblemsResponse {
  problems: Problem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardKPIs {
  totalProblems: number;
  openProblems: number;
  closedProblems: number;
  totalDuration: number;
  avgResolutionTime: number;
  problemsWithComments: number;
  githubActionProblems: number;
  criticalProblems: number;
}
