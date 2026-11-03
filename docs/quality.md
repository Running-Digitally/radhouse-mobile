# Quality and SonarQube workflow

Date: 2026-11-02. Required by the owner for the new mobile repository.

## Separate project

Use a separate project named **Radhouse Mobile**, key
`Running-Digitally_radhouse-mobile`, with branch `main`, on the existing
owner-designated SonarQube instance. Prefer private visibility for analysis
metadata even when source is public. Preserve existing quality profiles, gates,
new-code definitions and every other project.

The project was created on 2026-11-02 and its Permissions page verified private
visibility, with no anonymous Browse or See Source Code grant. It follows the
instance's default new-code definition (Previous version). The first analysis processed merged main `43677ba0ba3b60598b564f659ddc0658941b8db2`
on 2026-11-02. Its quality gate passed, with 90.4% coverage, no duplication,
23 maintainability issues, and zero security issues, reliability issues or hotspots.

Use a new project-scoped analysis token. Store it outside Git in macOS Keychain
or a private process environment. Do not reuse the backend or LifeOS token, place
credentials in command arguments, or give a PR job analysis/admin credentials.

## Required delivery cycle

1. Review the latest processed main analysis and all open findings in files being
   changed. For a new project, state explicitly that no baseline exists yet.
2. Implement a bounded slice with meaningful synthetic behavior/boundary tests,
   TypeScript checking, lint, coverage and appropriate native build checks.
3. Review the exact PR commit and run its required checks. The existing Community
   Build lane supports main analysis; do not present a feature branch as main.
4. After an authorized merge, scan a fresh clean snapshot of exact remote main
   with fresh coverage and explicit SCM revision. Stop on remote/source drift.
5. Wait for server processing. Verify the analyzed SHA, gate conditions, all-code
   and new-code issues, security hotspots, coverage and duplication separately.
6. Fix the new project's applicable findings in follow-up PRs, prioritizing
   security and reliability, then rescan each merged revision. Continue until
   actionable findings are resolved and the gate passes. Record the final SHA
   and remaining explicitly reviewed limitations.

Do not close a slice at “scan uploaded.” A failed gate is not necessarily failed
processing. Do not suppress findings, blanket-mark false positives, weaken gates
or exclude first-party code merely to obtain a clean result. A disputed finding
needs its issue key, source-based rationale and explicit review; it remains open
until resolved or an appropriate disposition is accepted.

## Coverage and evidence

Collect LCOV across first-party TypeScript/JavaScript, including unexecuted files.
Classify tests separately. Exclude only generated artifacts, dependencies and
vendored code from analysis. Keep native Kotlin/Swift/Objective-C review and
coverage limitations visible; Jest coverage does not measure native behavior.
Do not exclude native authentication/transport code to improve percentages.

Local Jest gates require 85% lines/statements/functions and 80% branches across
all first-party TypeScript/JavaScript. They do not change the server's quality
gate. Test session expiry, cancellation,
foreign-origin denial, redirect denial, stale responses, reconnect admission and
attachment ownership. Use simulator/device checks for native secure storage and
browser login that unit tests cannot establish.

The scanner wrapper must admit only this repository and project, verify exact
published main, generate fresh coverage in a disposable checkout, redact output,
and retain sanitized task/revision/gate/finding receipts. No standing runner or
scheduled scan is introduced by this plan. A documentation-only bootstrap has
no meaningful app-code scan; the first executable slice establishes the baseline.

## Local commands and credential setup

`npm run quality` runs TypeScript, ESLint, all Jest behavior tests with LCOV and
Python scanner-admission tests with coverage. The iOS simulator build is
`npm run ios:build`; Android uses `./gradlew :app:assembleDebug` in `android`.
Native builds are separate from the JavaScript and scanner-tooling coverage.

The implemented launcher is `scripts/sonar_scan.py`. Its admission tests require
clean published main, the expected repository/project and fresh synthetic test
coverage before retrieving the scanner credential. It never analyzes feature
source as main. It rechecks remote main before upload and supplies the exact SCM
revision. Use `python3 scripts/sonar_scan.py --help` for its supported options.

Store the owner-created Project Analysis Token in macOS Keychain as service
`homelab/sonarqube/radhouse-mobile`, account `radhouse-mobile-analysis`.
Do not put the value in chat, Git, shell arguments, or a PR. Project registration and dedicated Keychain token provisioning are complete;
the first processed main scan is recorded above.

The follow-up remediation replaces deprecated Firebase token/permission APIs,
extracts native request-admission/response helpers, simplifies UI conditionals,
and marks immutable members and component props read-only. No issues, rules,
profiles, quality gates or source coverage have been suppressed or excluded.
The confirmation scan of merged main
`0ee8a2583f393fec0cf8f77d63769ad4d87bd540` passed on 2026-11-02.
All 23 findings closed: zero open security, reliability or maintainability issues,
zero accepted issues and zero security hotspots. Overall coverage is 90.3%;
new-code coverage is 80.7%. Both overall and new-code duplication are 0.0%.
The scanner receipt records the exact SCM revision and server quality-gate PASS;
the authenticated dashboard independently confirms the processed measures.

The merged remediation passes 86 Jest tests, 15 scanner-tooling tests,
TypeScript and lint, with 95.30% line coverage. Tests cover Firebase Installation
ID acknowledgement, rotation, timeout, opt-out races, failed admission and
platform notification permissions. The existing backend validates the synthetic
FID and preserves the app-specific APNs topic. This is contract evidence, not a
replacement for physical delivery verification after updating the app.

The pre-merge review fixed immediate opt-out and overlapping push-cleanup races,
invalidated the session before waiting for remote notification cleanup on logout,
and returned Chat to the current conversation after sending from a notification.
Four regression tests cover these cases. That initial reviewed candidate passed 77 Jest
and 15 scanner-tooling tests, typecheck and lint, with 94.82% line coverage.

The dependency review pinned patched `@grpc/grpc-js` 1.14.7 and updated the React
Native CLI packages to 20.2.0. The production dependency audit now reports zero
high/critical findings and 13 affected low/moderate package entries. The remaining
root advisories concern deepmerge prototype poisoning and minimatch glob-pattern
amplification in development/build tooling. No patched deepmerge 4.x is published;
minimatch remediation requires a breaking API migration in its parent tools.
Do not use untrusted CLI configuration or glob patterns. Track compatibility
qualification separately; these are dependency limitations, not Sonar findings,
and have not been suppressed.

The native-browser follow-up analyzed merged main
`f004ce64cecb3ba2ab692f650ef88b6c44c78a39` on 2026-11-03. New-code coverage (90.0%)
and duplication (0.0%) passed; three maintainability findings failed the gate.
They were `123cea81-9d96-463a-9d6e-beb8114f4072` (browser component complexity),
`b0d21902-00fa-4830-b7c3-98ad4682864b` (optional chaining), and
`cfe86e6a-0d84-4c6c-a4a3-049660adde32` (connected-screen complexity). The earlier
research-control nested ternary closed. The bounded follow-up extracts native
header/connection rendering and the browser-destination predicate; it preserves
state, commands and control boundaries. Typecheck, lint, 161 application tests,
coverage thresholds and 15 tooling tests pass. Server closure and the final gate
must be confirmed by the next exact-main analysis, not inferred from this edit.
