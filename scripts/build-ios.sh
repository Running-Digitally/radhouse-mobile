#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .evidence
xcodebuild -workspace ios/RadhouseMobile.xcworkspace -scheme RadhouseMobile \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .evidence/DerivedData CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  > .evidence/ios-build.log 2>&1 || { tail -60 .evidence/ios-build.log; exit 1; }
tail -5 .evidence/ios-build.log
