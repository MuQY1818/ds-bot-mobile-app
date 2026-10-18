import type { Capability, CapabilityStatus } from "../types";

export function capabilityStatus(item: Capability, statuses: Record<string, CapabilityStatus>) {
  // The host reports a pack under its own name, without exposing its children.
  if (statuses[item.name] || item.kind !== "pack") return statuses[item.name];
  const children = (item.items || []).map(name => statuses[name]).filter(Boolean);
  for (const state of ["error", "needs-approval", "connecting", "ready"] as const) {
    const found = children.find(value => value.state === state);
    if (found) return found;
  }
  return undefined;
}
