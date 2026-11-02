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
instance's default new-code definition (Previous version). No analysis,
quality-gate result or finding closure is claimed until the first executable main scan has processed.

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
Do not put the value in chat, Git, shell arguments, or a PR. Project registration
is complete; token provisioning and the first processed main scan remain pending.

The live-session candidate touches new authentication and viewer code. There is
still no processed mobile Sonar baseline to inspect; no finding has been
suppressed or claimed closed. The native bridge requires explicit platform
review and device qualification in addition to Jest coverage.
