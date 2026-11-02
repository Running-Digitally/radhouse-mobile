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
and remote push delivery remain in development.

The Firebase messaging adapter is connected to authenticated registration and
notification controls. The matching backend outbox is a separate, undeployed
candidate; the app reports notifications unavailable until configured. Do not
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
