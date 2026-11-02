# Push delivery contract

Status: authenticated mobile integration implemented; matching backend deployed
and provider validation passed on 2 November 2026. Physical notification receipt
and tap behavior remain pending acceptance. Owner choice,
2 November 2026: reuse the existing Apple developer team
and Firebase project, with separate Radhouse application registrations. Keep
provider identifiers, credentials and deployment evidence in private operations
records. App identifiers on both platforms are `com.runningdigitally.radhouse`.

## Notification and consent

Request permission after the authenticated owner chooses reply notifications.
Registration must use the current Radhouse session and its CSRF protection.
Firebase auto-init and iOS automatic remote registration are disabled until this
flow runs. Android 13+ additionally requires POST_NOTIFICATIONS permission.
Never initialize notification delivery from the sample-notification button.

Send a generic title and body: “Radhouse” / “Your Radhouse reply is ready”. The
only data fields are `version: "1"`, `kind: "reply_ready"`, `event_id` and
`request_id` (UUIDs). Include no text from conversations, terminal output, files,
credentials or navigation URLs. Provider keys stay exclusively on the server.
A notification tap requires a successful authenticated read of the corresponding
request before opening Chat. A failed or forbidden read must not navigate or send
anything. Queue at most one pending target while signed out; discard prior-user
work and duplicate events at the session boundary.

## Backend integration

These routes are implemented in the deployed backend:

- `GET /chat/push/status` reports availability only when push is configured.
  A missing route is shown as unavailable; authentication errors are not hidden.
- `PUT /chat/push/devices/{installation_id}` accepts the platform and FCM token.
  The server derives owner, conversation and session binding from authentication.
  Bound the request, validate identifiers, and reject caller-supplied identities.
- `DELETE /chat/push/devices/{installation_id}` revokes only that owner's device
  registered under the requesting session. Delayed cleanup from an old session
  cannot delete a newer registration.
  Make deletion idempotent. Logout must also revoke the server session; do not
  depend solely on the handset reaching this route.
- An outbox observes durable completed replies independently of client polling.
  Use one deterministic event per request and unique delivery per registration.
  Registering a new handset must not replay the entire historical conversation.

Keep registration tokens and the outbox in protected server storage. Bind each
registration to an active session without storing the raw session credential.
Check current actor activity, conversation binding, session revocation/expiry and
notification consent before dispatch. Do not refresh session expiry merely by
sending notifications. Revoke stale registrations on logout and token rejection.
A token rotation increments the registration generation; queued work must never
send to a replaced token.

Enqueue completion transactionally, or reconcile durable completion records with
an idempotent outbox so a crash between completion and enqueue loses no event.
Use bounded retry, expiry and backoff for transient provider failures. Remove
invalid tokens, retain sanitized delivery outcomes, and never log token values
or provider responses that may contain private content. Network ambiguity may
produce duplicate provider delivery; retain a stable event ID and use platform
collapse identifiers. Do not promise exactly-once notification presentation.

## Native and provider prerequisites

The iOS application needs a verified team, explicit App ID, push entitlement and
matching signed provisioning profile. Firebase needs a qualified APNs key for
Radhouse's bundle and the intended sandbox/production environment. Reusing a team
or Firebase project does not automatically configure a newly registered app's
APNs credentials. Android needs the matching Google Services configuration and
a device/emulator with Google Play services.

The server needs least-privilege FCM send authorization for the selected project.
Credential creation or upload is an owner-controlled setup step. No provider
credential belongs in the app bundle or public repository. Do not change an
existing product's registration, signing or messaging settings to enable Radhouse.

## Acceptance before calling push working

1. Qualify both Cloudflare Access and Radhouse authentication in the app, then
   prove owner-bound register/update/revoke routes and backend outbox behavior.
2. Test notification denial and opt-out, refresh rotation, invalid tokens,
   offline logout, session expiry and account changes without leaking content.
3. Send a real reply-ready notification through FCM/APNs to a signed physical
   iPhone and through FCM to Android, with the app foregrounded, backgrounded and
   cold-started. Record the provider result and on-device receipt separately.
4. Tap a notification after authentication expiry, after logout, twice and while
   offline. Confirm ownership is rechecked and no message/terminal input replays.
5. Complete the merged-main SonarQube scan/fix/rescan cycle. Unit tests and local
   notification previews cannot substitute for provider or device proof.

The session client now supplies authenticated `PushRegistration` callbacks with
CSRF protection and rejects registration after a session change. Opt-in is saved
separately in device-only secure storage and restored only for the same username.
Foreground notifications show a generic indicator; a tap rechecks request
ownership before loading the corresponding turn. Sign-out attempts device
unregistration and provider token deletion, then revokes the server session.
Offline revocation cannot be guaranteed and must remain visible to the user.

Local validation on 2 November: 73 Jest behavior tests and 15 scanner-tooling
tests passed, as did TypeScript, lint, coverage gates, iOS Release simulator and
Android Release builds. Permission denial, persistence, account changes, token
rotation, cleanup failures and stale asynchronous operations have synthetic
coverage. Physical iPhone and Samsung installation, sign-in and native Chat have
owner acceptance. Provider credentials are configured and authenticated FCM
validation passed through the restricted sender network path. After the native
workspace-header repair, a real message completed and the provider accepted two
notifications. The owner confirmed both physical phones received the alert and
tapping opened the correct reply. Broader foreground/cold-start, expired-session,
offline and logout behavior still need device qualification; this successful
receipt/tap test does not establish every acceptance case above.

## Firebase Installation ID migration

Build 4 opts in with `messaging_installation_id_enabled` in `firebase.json`.
The SDK generates both native platform flags from this single setting. Automatic
initialization remains disabled. The app requests notification permission from
the OS, registers for APNs on iOS, subscribes to `onRegistered`, and then calls
Firebase `register`. It reports enabled only after the authenticated backend
acknowledges the FID; timeouts and cancellation invalidate late callbacks.
Opt-out calls Firebase `unregister`, with server cleanup kept session-bound.

The existing device endpoint's `token` field remains the compatibility transport
for the FID. Registration replaces the old target at the same app installation
UUID, preserving saved consent and owner binding. Google's
[FCM REST contract](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages)
explicitly accepts FIDs in the existing `token` target during the transition.
A future backend-only migration should use the dedicated `fid` field before
Google removes that compatibility. This release needs no server schema or
privileged deployment change. Physical delivery on both updated apps remains a
release acceptance check because identifiers change during migration.
