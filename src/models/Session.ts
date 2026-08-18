// src/models/Session.ts
export interface Session {
  id: string;
  userId: string;
  activityType: string;
  startedAt?: string;
  endedAt?: string;
}
