export type MobileCapabilities = Record<string, unknown>;

// An explicit action allowlist is authoritative. Older hosts may only advertise
// a feature flag; absent information must not enable optional host operations.
export function supportsMobileAction(capabilities: MobileCapabilities | undefined, action: string, feature?: string): boolean {
  if (!capabilities) return false;
  if (feature && capabilities[feature] === false) return false;
  if (capabilities.actions === false) return false;
  if (Array.isArray(capabilities.actions)) return capabilities.actions.includes(action);
  return !!feature && capabilities[feature] === true;
}
