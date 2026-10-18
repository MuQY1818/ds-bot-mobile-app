# Native runtime notifications

Local Expo module, automatically linked from `apps/mobile/modules/` during prebuild.
Android uses a visible `remoteMessaging` foreground service with a stop action and
native HTTPS polling. iOS uses a cancellable `beginBackgroundTask` handoff; it
does not claim unlimited background execution. No runtime push credentials are
required. Optional Expo push remains separate.

The receiver only holds an in-memory, notification-only registration. It never
receives chat access or refresh tokens, follows redirects, or persists registration
values. It stops on authorization expiry/revocation. Android stores only the
boolean preference when a user stops the receiver from the notification tray.

The app passes its selected `en` or `zh` language when starting the receiver.
Changing the app language updates receiver titles, generic notification bodies
and the Android stop action without renewing the lease or resetting its cursor.

After changes, rebuild the native app; Metro or an OTA JS update cannot install
the native service. Do not edit the ignored generated Android/iOS projects.

Deployment and device limitations: [feature guide](../../../../docs/mobile-features.zh.md).
