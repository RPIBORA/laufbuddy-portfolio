import { User } from '../models/User';
import { AuthStatus } from './authStatus';

export interface AuthState {
  user: User | null;
  status: AuthStatus;
}
