#!/usr/bin/env bash
set -euo pipefail
config_source="$SRCROOT/RadhouseMobile/GoogleService-Info.plist"
config_destination="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/GoogleService-Info.plist"
if [[ -f "$config_source" ]]; then
  config_bundle=$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "$config_source")
  if [[ "$config_bundle" != "$PRODUCT_BUNDLE_IDENTIFIER" ]]; then
    echo 'error: Firebase configuration belongs to another application.' >&2
    exit 1
  fi
  cp "$config_source" "$config_destination"
else
  # An incremental preview build must not retain an earlier provider config.
  rm -f "$config_destination"
fi
