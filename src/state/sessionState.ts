import { Session } from '../models/Session';
import { SessionStatus } from './sessionStatus';

export interface SessionState {
  session: Session | null;
  status: SessionStatus;
}
