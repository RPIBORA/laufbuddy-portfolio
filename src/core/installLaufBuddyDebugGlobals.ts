// src/core/installLaufBuddyDebugGlobals.ts
import * as debugTestKit from './debugTestKit';

export type LaufBuddyDebugGlobals = typeof debugTestKit;

declare global {
  var laufBuddyDebug: LaufBuddyDebugGlobals | undefined;
}

export function installLaufBuddyDebugGlobals(): LaufBuddyDebugGlobals {
  globalThis.laufBuddyDebug = debugTestKit;
  return debugTestKit;
}

export function uninstallLaufBuddyDebugGlobals(): void {
  delete globalThis.laufBuddyDebug;
}

export default installLaufBuddyDebugGlobals;