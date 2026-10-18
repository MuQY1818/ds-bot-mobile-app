#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
input=${1:?usage: sign-android.sh unsigned.apk signed.apk}
output=${2:?usage: sign-android.sh unsigned.apk signed.apk}
: "${ANDROID_KEYSTORE_PASSWORD:?Set ANDROID_KEYSTORE_PASSWORD from your private signing backup or GitHub Secret}"
: "${ANDROID_KEYSTORE_PATH:?Set your private keystore path}"
: "${ANDROID_KEY_ALIAS:?Set your private signing alias}"
: "${ANDROID_SIGNING_CERT_SHA256:?Set the expected signer SHA-256}"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
tools=$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)
"$tools/apksigner" sign --ks "$ANDROID_KEYSTORE_PATH" --ks-key-alias "$ANDROID_KEY_ALIAS" \
  --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD \
  --out "$output" "$input"
"$tools/apksigner" verify --verbose --print-certs "$output"
# Build Tools 36 names scheme signers "V3.0 Signer:"; older tools use "Signer #1".
# Every reported signer must have the project's certificate.
actual=$("$tools/apksigner" verify --print-certs "$output" | sed -nE 's/^(Signer #[0-9]+|V[0-9.]+ Signer):? certificate SHA-256 digest: //p' | sort -u)
expected=$(printf '%s' "$ANDROID_SIGNING_CERT_SHA256" | tr -d '[:space:]')
if [[ "$actual" != "$expected" ]]; then
  echo 'APK certificate does not match the explicit expected certificate' >&2
  exit 1
fi
