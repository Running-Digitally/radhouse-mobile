# Radhouse Mobile design

Date: 2026-11-02. Status: proposal; implementation and device proof pending.
Design depth: D2, because native authentication and the backend contract cross
trust boundaries. The immediate operational prerequisite is a protected HTTPS
hostname usable without a device VPN.

## Experience

Open the app, authenticate, return to the same assistant conversation, send a
message, leave, and resume the eventual reply. Make Chat the initial screen,
with Library and Settings as the other primary destinations. Show the assistant's
existing name and appearance rather than inventing a separate mobile identity.

Use a native React Native/TypeScript application with iOS and Android platform
projects. Reuse proven engineering patterns from the owner's existing apps after
reviewing their current licenses and contracts; do not copy private data or
backend-specific authentication assumptions. Pin the supported toolchain at
implementation time. Simulator work precedes signing and device distribution.

## Source-backed boundary

Reviewed Radhouse source at `83788dfd6db55ca655551ef5302083990a2a2133`:

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
| `src/settings/` | Account state, connectivity, capability/version information |
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

Browser observation/control, voice, share extensions, push, background sync,
Terminal and editable administration follow after the core conversation flow.
They have distinct privacy and lifecycle contracts and are not first-slice work.

Every executable slice uses the [quality workflow](quality.md). Success requires
both behavior proof and server-confirmed SonarQube remediation; an unscanned
project or a passing local linter is not a clean SonarQube result.

## References

- [Cloudflare self-hosted application protection](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare application token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/)
- [Radhouse source](https://github.com/Running-Digitally/radhouse)
