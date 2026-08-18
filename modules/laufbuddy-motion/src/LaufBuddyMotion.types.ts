export type LaufBuddyMotionActivity =
  | 'running'
  | 'walking'
  | 'on_foot'
  | 'still'
  | 'on_bicycle'
  | 'in_vehicle'
  | 'unknown';

export type LaufBuddyMotionTransition = 'enter' | 'exit' | 'unknown';

export type LaufBuddyMotionState = 'moving' | 'still' | 'unknown';

export type LaufBuddyMotionActivityPayload = {
  activity: LaufBuddyMotionActivity;
  transition: LaufBuddyMotionTransition;
  motionState: LaufBuddyMotionState;
  moving: boolean | null;
  elapsedRealtimeNanos: number | null;
  eventAtMs: number;
};

export type LaufBuddyMotionStatus = {
  available: boolean;
  hasPermission: boolean;
  started: boolean | null;
  message: string | null;
  lastActivity: LaufBuddyMotionActivityPayload;
};

export type LaufBuddyMotionModuleEvents = {
  onMotionActivityChanged: (params: LaufBuddyMotionActivityPayload) => void;
};
