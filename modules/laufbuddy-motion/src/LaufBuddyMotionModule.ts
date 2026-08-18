import { NativeModule, requireNativeModule } from 'expo';

import type {
  LaufBuddyMotionActivityPayload,
  LaufBuddyMotionModuleEvents,
  LaufBuddyMotionStatus,
} from './LaufBuddyMotion.types';

declare class LaufBuddyMotionModule extends NativeModule<LaufBuddyMotionModuleEvents> {
  getStatusAsync(): Promise<LaufBuddyMotionStatus>;
  getLastActivityAsync(): Promise<LaufBuddyMotionActivityPayload>;
  startActivityRecognitionAsync(): Promise<LaufBuddyMotionStatus>;
  stopActivityRecognitionAsync(): Promise<LaufBuddyMotionStatus>;
}

export default requireNativeModule<LaufBuddyMotionModule>('LaufBuddyMotion');
