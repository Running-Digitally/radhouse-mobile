# Radhouse Mobile design

Date: 2026-11-02. Status: native preview implemented; live integration and device proof pending.
Design depth: D2, because native authentication and the backend contract cross
trust boundaries. The immediate operational prerequisite is a protected HTTPS
hostname usable without a device VPN.

## Experience

Open the app, authenticate, return to the same assistant conversation, send a
message, leave, and resume the eventual reply. Make Chat the initial screen,
with Library, Browser, Terminal and Settings as the other primary destinations.
Owner scope update on 2026-11-02: include the streaming browser, owner terminal
and working push notifications in the mobile delivery plan. Show the assistant's
existing name and appearance rather than inventing a separate mobile identity.

Use a native React Native/TypeScript application with iOS and Android platform
projects. Reuse proven engineering patterns from the owner's existing apps after
reviewing their current licenses and contracts; do not copy private data or
backend-specific authentication assumptions. Pin the supported toolchain at
implementation time. Simulator work precedes signing and device distribution.

## Source-backed boundary

Reviewed Radhouse source at `b85f45cebbb6f2cb5f939ee8c8fb6f5a303edc6e`:

- `src/radhouse/chat/main.py` wires local authentication, the transcript store,
  the Hermes client, browser services and optional features.
- `src/radhouse/chat/app.py` provides `/auth/login`, `/auth/session` and
  `/auth/logout`; login needs username, password and TOTP. The returned session
  uses an HttpOnly, Secure, SameSite=Strict cookie and a CSRF token.
- `src/radhouse/auth/local.py` validates the configured exact Origin and CSRF
  on unsafe requests, and resolves the existing principal/conversation binding.
- `src/radhouse/chat/service.py` and `store.py` own durable message/reply
  admission, idempotency and recovery. `Message.request_id` is a UUID.

Cloudflare Access is an outer access boundary. It does not currently replace
Radhouse's password/TOTP authentication or establish its conversation binding.
No native token-exchange, refresh-token or delegated Access-login API is claimed.

## Authentication decision

First qualify the existing web application through Cloudflare Access while
retaining its local login and private access path. Keep credentials and Access
policies installation-specific, with no service token embedded in an app binary.

For native login, evaluate the already-proven LifeOS encrypted browser-transfer
pattern against the current Cloudflare protocol on both platforms. It is a
compatibility integration, not an official mobile SDK. Obtaining an Access token
alone is insufficient: Radhouse must still authenticate and authorize the local
session. A native implementation needs a reviewed cookie/session adapter, exact
Origin and CSRF behavior, secure storage and separate expiry handling for both
layers. Persist neither passwords nor TOTP seeds.

A later single-login design may map a cryptographically validated Access identity
to the existing owner and issue a bounded Radhouse session. That changes backend
authentication and requires its own reviewed contract; never trust an email header
alone or remove local login as part of the hostname addition.

## Components and control flow

```text
Native screens -> controllers -> validated Radhouse client -> native HTTPS
                    |                 |
                    |                 +-> Access session adapter
                    +-> session state +-> local session/CSRF adapter

System browser -> Access login -> qualified transfer -> secure app credential
Radhouse login -> local session -> owner-bound conversation -> reads/writes
```

Proposed modules:

| Module | Responsibility |
| --- | --- |
| `src/auth/` | Two-layer session state, secure storage, sign-in/out and expiry |
| `src/api/` | Fixed-origin requests, response validation and typed errors |
| `src/chat/` | Transcript, composer, pending reply reconciliation and retry UX |
| `src/library/` | Existing file list, original download and explicit upload/share |
| `src/browser/` | Authenticated streaming viewer, touch input and existing control modes |
| `src/terminal/` | Existing terminal viewer, explicit open/close and reconnect |
| `src/notifications/` | Permission, device registration, reply-ready delivery and safe deep links |
| `src/settings/` | Account state, connectivity, notification permission and capabilities |
| `src/fixtures/` | Clearly labelled synthetic development transport |

The client exposes `restoreSession`, `signIn`, `signOut`, `readConversation`,
`sendMessage`, `readPendingReply`, `listFiles` and `uploadFile`; concrete wire
types must be derived from the selected backend revision before implementation.
Views never hold credentials. Transport must prevent token-bearing redirects or
requests to arbitrary hosts. Separate temporary connectivity failure from
authentication rejection; a transient failure must not erase a valid credential.

On Send, freeze text, attachments and one request UUID. After a timeout or app
resume, reconcile that same UUID with server state before offering retry. Never
generate a new UUID automatically for an uncertain admission. Discard responses
from an earlier session after logout or identity change. Backgrounding does not
promise continuous mobile execution; the backend retains pending work.

Private results stay in memory initially. Defer offline message queues and local
transcript databases until their ordering, encryption, deletion and recovery
contracts are designed. Hide private content in task-switcher previews.

## Delivery slices and acceptance

1. **Access prerequisite:** protected web hostname, exact-origin writes,
   certificate verification, retained private URL, anonymous denial and owner
   acceptance from a phone with WARP disabled.
2. **Synthetic simulator slice:** sign-in, existing-conversation view, Send,
   pending/completed reply, attachment detail, logout and session expiry. Build
   and inspect iOS Simulator and Android emulator flows. Fixture answers remain
   explicitly labelled.
3. **Live authentication and read-only continuity:** qualify both auth layers,
   secure restart restoration, transcript and Library reads. Do not retain private
   bodies in evidence. Confirm failures never display another session's data.
4. **Live sending and files:** qualify one owner-approved canary, disconnect
   during admission, background/resume, duplicate prevention and exact original
   download/upload. Honor capability flags; do not imply token streaming or Stop
   support until the selected backend supports and qualifies them.
5. **Devices and distribution:** physical iPhone/Android proof, signing,
   TestFlight and Android delivery after separate release authorization.

Browser, Terminal and push are included in the requested mobile scope. Voice,
share extensions, background sync and editable administration remain later work.
Their inclusion does not claim that a synthetic simulator slice establishes live
streaming, terminal commands or remote push delivery.

## Browser and Terminal implementation boundary

Keep native Chat, Library and navigation. Embed the existing authenticated Browser
and Terminal viewers in a restricted web surface initially, rather than replace
the streaming codec, terminal renderer or server authority checks. Both surfaces
require a qualified adapter for Access and local Radhouse sessions; arbitrary
external pages must never receive application credentials or a native bridge.

The reviewed backend at `b85f45cebbb6f2cb5f939ee8c8fb6f5a303edc6e` provides:

- Browser assets and a WebSocket relay under `/chat/browser/stream/`, authenticated
  to the current principal, conversation and session binding. Preserve the
  existing Private/Observe modes, explicit takeover/return and lease checks.
- Terminal POST operations under `/chat/terminal/`: open, status, output, input,
  resize, close and context-scrub. Output uses a bounded cursor and long polling;
  input has sequence acknowledgements and terminal generation/attachment binding.
  Do not describe this terminal transport as a WebSocket.

Opening either screen is read-only until the owner explicitly opens a terminal
or takes browser control. Test touch/keyboard input, landscape layout, app
backgrounding and reconnect. Never replay an unconfirmed terminal write, reopen
a closed terminal automatically, or silently share terminal/browser content into
a chat message. Pause viewers on backgrounding and restore only after checking
authentication and current server ownership.

## Push notification contract

Initial notification: a reply becomes ready after the owner sends a message. The
server remains the delivery authority; a suspended app cannot reliably discover
completion by polling. Add a reviewed backend registration/delivery contract and
an idempotent completion event keyed to the existing request UUID. Keep APNs and
FCM credentials on the server, outside Git and the app binary.

The app requests notification permission in context, registers its platform token
only after local owner authentication, refreshes rotated tokens, and unregisters
the device on sign-out. Revoked/invalid tokens must stop receiving notifications.
Separate app identifiers and device registrations from other products. Provider
configuration and signing must be verified before sending any real push.

Use a generic “Your Radhouse reply is ready” notification by default, with a
versioned opaque request identifier and event identifier. Do not include reply
text, command output, filenames, credentials or arbitrary navigation URLs. On
tap, validate the payload, restore authentication, and reconcile the request
against the existing owner-bound conversation before opening it. A notification
is a hint, not authority or an instruction to send/retry a message. Deduplicate
foreground/tap delivery and ignore stale responses after sign-out.

Acceptance includes notification denial, token rotation, logout, duplicate and
malformed payloads, offline tap, cold launch, foreground and background delivery.
Simulator push injection proves presentation/routing only. Actual APNs/FCM delivery
requires a signed physical-device test with the app backgrounded or closed. No
remote-delivery claim may be based solely on a local notification or simulator
payload. The first executable slice establishes the native shell and synthetic
behavior proof; live auth/viewers and remote push remain required follow-up slices.

Every executable slice uses the [quality workflow](quality.md). Success requires
both behavior proof and server-confirmed SonarQube remediation; an unscanned
project or a passing local linter is not a clean SonarQube result.

## References

- [Cloudflare self-hosted application protection](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare application token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Radhouse source](https://github.com/Running-Digitally/radhouse)

## Implemented connection candidate

The next slice adds the Access encrypted browser-transfer flow, followed by native
Radhouse password/TOTP login through the existing `/auth/login` contract. The
application token and local session token are stored together in device-only
secure storage. Passwords and TOTP values are not persisted. Local parsing binds
issuer, audience and expiry; the Access gateway remains the signature/identity
verification authority. This compatibility flow follows the public cloudflared
transfer protocol and needs qualification on each supported platform.

Dedicated native HTTPS bridges reject redirects and foreign destinations, disable
HTTP caches/cookie jars and bound response accumulation. Only an authenticated
login response can supply the local session cookie. Explicit same-origin Origin
and CSRF headers preserve server authorization. An authenticated restore checks
`/auth/session` before displaying owner data and installs host-scoped, Secure,
HttpOnly viewer cookies. Logout invalidates asynchronous work and clears secure
storage and viewer data even when server revocation cannot be confirmed offline.

Connected screens now read transcript and Library data, send messages with one
frozen request UUID across explicit retries, and mount the existing Browser and
Terminal viewers only when authenticated, foregrounded and server-capable.
Library download/upload and native attachment/context selection remain pending.
The UI conceals private content while inactive; iOS also covers the native window
for task snapshots and Android disables recents capture (older Android versions
use FLAG_SECURE). Re-entry validates the session before remounting viewers.

Synthetic transport and UI tests cover the connection flow, stale login/logout
races, malformed replies, denied capabilities, foreground revalidation and
uncertain submission. Successful native builds do not establish live login,
viewer streaming or real-device push acceptance. Record those separately.

References: [cloudflared transfer source](https://github.com/cloudflare/cloudflared/blob/master/token/transfer.go),
[React Native security](https://reactnative.dev/docs/security).
