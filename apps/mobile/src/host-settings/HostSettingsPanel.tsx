import React from "react";
import { ConnectorsPanel } from "./ConnectorsPanel";
import { FeedbackPanel } from "./FeedbackPanel";
import { HarnessPanel } from "./HarnessPanel";
import { SecretsPanel } from "./SecretsPanel";
import { PanelProps } from "./shared";

export function HostSettingsPanel({
  page,
  ...props
}: PanelProps & {
  page: "connectors" | "secrets" | "feedback" | "harness";
}) {
  if (page === "connectors") return <ConnectorsPanel {...props} />;
  if (page === "secrets") return <SecretsPanel {...props} />;
  if (page === "feedback") return <FeedbackPanel {...props} />;
  return <HarnessPanel {...props} />;
}
