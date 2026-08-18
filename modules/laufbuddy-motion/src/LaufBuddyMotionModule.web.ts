import { registerWebModule, NativeModule } from 'expo';

import { LaufBuddyMotionModuleEvents } from './LaufBuddyMotion.types';

// LaufBuddyMotionModule is not available on the web platform.
class LaufBuddyMotionModule extends NativeModule<LaufBuddyMotionModuleEvents> {}

export default registerWebModule(LaufBuddyMotionModule, 'LaufBuddyMotionModule');
