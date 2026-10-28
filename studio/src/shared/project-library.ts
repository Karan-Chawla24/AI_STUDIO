export const creationStatuses = ["DRAFT", "PLANNING", "STORYBOARD_REVIEW", "STORYBOARD_APPROVED", "READY_TO_GENERATE", "GENERATING", "VIDEO_READY", "NEEDS_ATTENTION"] as const;
export const publicationStatuses = ["NOT_PUBLISHED", "SCHEDULED", "PUBLISHING", "PUBLISHED", "NEEDS_ATTENTION"] as const;
export type ProjectSummary = { id: string; title: string; revision: number; resourceVersion: number; creationStatus: string; publicationStatus: string; stale: boolean; durationSeconds: number | null; thumbnailAvailable: boolean; createdAt: string; updatedAt: string; allowedActions: string[] };
export type ProjectPage = { items: ProjectSummary[]; page: { nextCursor: string | null; hasMore: boolean; limit: number } };
export type Dashboard = { asOf: string; counts: { projectsTotal: number; drafts: number; needsReview: number; readyVideos: number; activeJobs: number; scheduledPosts: number; attentionItems: number }; recentProjects: ProjectSummary[]; upcomingSchedules: [] };
export function statusLabel(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
