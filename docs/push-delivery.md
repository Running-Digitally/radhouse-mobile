# Push delivery contract

Status: mobile adapter implemented; backend integration and real-device delivery
pending. Owner choice, 2 November 2026: reuse the existing Apple developer team
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

## Proposed backend integration

These routes are a design contract, not currently deployed API endpoints:

- `PUT /chat/push/devices/{installation_id}` accepts the platform and FCM token.
  The server derives owner, conversation and session binding from authentication.
  Bound the request, validate identifiers, and reject caller-supplied identities.
- `DELETE /chat/push/devices/{installation_id}` revokes only that owner's device.
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

The adapter currently provides `PushRegistration` callbacks for the future
session-aware client. It intentionally has no embedded server token or arbitrary
notification URL handler. Live integration remains necessary before release.
