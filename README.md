# Radhouse Mobile

Native iPhone and Android companion for Radhouse, built with React Native and
TypeScript. The first executable slice is an explicitly labelled development
preview with native Chat, Library, Browser, Terminal and Settings screens.

The preview uses synthetic data. A separate **Connect to my Radhouse** flow now
implements two-layer sign-in, secure session restoration, native conversation
and Library reads, explicit message submission, and authenticated Browser and
Terminal viewers. Native sign-in, saved-session restoration and Terminal opening
have been qualified in the iOS simulator. Browser opening currently encounters a
shared server conflict also reproduced in the web app. Library downloads/uploads
remain in development. Physical notification delivery is under qualification.

The Firebase messaging adapter is connected to authenticated registration and
notification controls. The matching backend outbox was deployed on 2026-11-02
with provider validation and authentication-boundary checks passing. Physical
notification receipt and tap behavior still require device acceptance. Do not
treat the sample notification button or a successful native build as evidence of
APNs/FCM delivery.

## Develop

Use Node.js 22.11 or newer and the committed npm lockfile:

```sh
npm ci
python3 -m pip install -r requirements-quality.txt
npm run quality
```

For iOS, install the Gemfile dependencies and CocoaPods, then open
`ios/RadhouseMobile.xcworkspace`. `npm run ios:build` produces an ad-hoc signed
Release simulator app without Metro or Apple distribution credentials. The app
uses UIKit scenes so it can launch with the iOS 27 SDK.

For Android, configure the Android SDK and JDK 17, then use `npm run android`.
`cd android && ./gradlew :app:assembleDebug` validates the native debug build.
Device distribution and production signing are separate from these local builds.

The owner selected internal TestFlight for iPhone delivery. Prepare a Release
archive with the configured Apple team and automatic signing, then validate and
distribute through Xcode's **TestFlight Internal Only** flow. Use production APNs
credentials for TestFlight; a sandbox key cannot qualify notification delivery.
The native app already adopts UIKit scenes for iOS 27. Its icon is rendered from
the existing Radhouse brand mark; see [the asset source](assets/brand/README.md).
An archive build is not an uploaded or accepted TestFlight release.

Build **1.0 (3)** from `4388e2c` is available in the owner's internal TestFlight
group and single-owner Google Play internal track. Play's imported signing
certificate matches the installed owner-testing Android build, preserving the
identity required for an in-place update. This avoids USB debugging, which
conflicts with the phone's work profile. Physical sign-in retention and sending
after the store updates await owner acceptance.

The update includes canonical Android launcher icons, stable Chat input during
background refresh, initial positioning at the latest message, and a composer
outside scrolling history. Both native transports send the workspace-binding
header required by browser-enabled servers. The iOS simulator confirms the
composer stays above the onscreen keyboard across refreshes, and a real message
completed successfully. The provider accepted two reply notifications; the owner
confirmed both physical phones received the alert and tapping opened the correct
reply. Broader push lifecycle behavior remains under qualification.

The TestFlight upload has missing debug-symbol warnings for prebuilt React,
ReactNativeDependencies and Hermes frameworks, limiting crash symbolication
inside those dependencies. Signing keys, client configurations and private
device evidence remain outside Git.

Complete Apple's encryption questionnaire from the actual implementation: the
app uses platform HTTPS/Keychain and bundled TweetNaCl for encrypted Access-token
transfer. Do not declare it OS-crypto-only. Keep signing credentials, archives,
client configurations and upload receipts outside Git.

## Push setup

Use separate iOS and Android Firebase registrations for
`com.runningdigitally.radhouse`. Keep installation-specific client configs in the
gitignored paths `ios/RadhouseMobile/GoogleService-Info.plist` and
`android/app/google-services.json`. The preview builds without these files.
The iOS build checks the configuration's bundle identifier before copying it.
Never put provider service-account keys or APNs signing keys in the application.

Messaging auto-initialization and automatic iOS registration are disabled.
The authenticated opt-in flow must call the adapter explicitly. Tests cover
permission denial, token rotation, revocation failures, stale asynchronous work,
malformed notifications and authenticated navigation. These tests do not prove
APNs/FCM delivery. See [push delivery](docs/push-delivery.md) for remaining work.

## Native browser and live chat preview

The browser screen uses native title/address controls, explicit takeover and
handback, and a native tools sheet for privacy, navigation and reading zoom.
Only the authenticated remote canvas is embedded. Chat shows a live, view-only
mini browser while the agent is browsing and keeps a dismissible Browser ready
card afterward. The mini shows the top of the stream at full card width. Expanding keeps the same
browser tab and does not take control; returning preserves the chat draft and
mounted conversation. The preview shrinks while the keyboard is visible.

Private mode, session expiry and backgrounding remove the preview. Local reading
zoom is view-only; fit the page before interacting. Reconnect refreshes the view
without replaying browser actions. The remote page remains a fixed-size isolated
desktop browser, not a native or responsive mobile page. Terminal retains its
existing viewer. No owner browser profile or additional agent permissions are
introduced.

The bridge admits a fixed authenticated canvas and its owned stream only.
Presentation messages carry bounded status, title and address fields, never
session credentials or control leases. Android's origin-only bridge events are
accepted only while that exact canvas is the loaded document. Native tests cover
navigation restrictions, view-only expansion, privacy, uncertain actions,
background removal and draft continuity. Chromium/WebKit canvas checks and
simulator screenshots provide separate UI evidence; live deployment and physical
phone acceptance remain release gates.

Public research controls also run through the actual authenticated session
client in integration tests, including explicit enable, saved revision refresh
and independent revocation. Synthetic test data does not authorize research on
an owner's commitment.

## Engineering contracts

- [Mobile design and delivery slices](docs/mobile-design.md)
- [Quality and SonarQube workflow](docs/quality.md)
- [Radhouse engineering roadmap](https://github.com/Running-Digitally/radhouse/blob/main/ROADMAP.md)

The backend owns conversations, pending replies, files, assistant identity and
runtime operations. Mobile presents those existing contracts. It must not create
a second assistant history or replay a message just because connectivity changed.

Keep credentials, deployment topology, private conversations and device evidence
out of Git. Public tests use synthetic fixtures. Local passing checks do not
establish a clean SonarQube project: the merged source must be scanned and its
findings remediated through the documented workflow.
