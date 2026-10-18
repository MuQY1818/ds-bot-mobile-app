import { tr } from "../i18n";
import React from "react";
import { Notice } from "./UI";
export function PairingScanner(_props: {
  disabled: boolean;
  onScan: (value: string) => void;
}) {
  return (
    <Notice text={tr("QR scanning is available in the iOS and Android app. Paste pairing JSON below to connect this browser preview.")} />
  );
}
