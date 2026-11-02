# Mobile app mark

`favicon.svg` is copied unchanged from Radhouse's canonical `brand/favicon.svg`.
The iOS icon uses that mark on a full, opaque cream background; iOS applies the
device's icon mask. No new logo or colour palette is introduced.

On macOS, `swift assets/brand/render-icon.swift assets/brand/favicon.svg OUTPUT.png
1024` renders an opaque sRGB master using AppKit. Resize the master to the pixel
sizes listed in `ios/RadhouseMobile/Images.xcassets/AppIcon.appiconset/Contents.json`
with `sips -z SIZE SIZE OUTPUT.png --out DESTINATION.png`.

Android uses the same opaque master for its legacy launcher densities. Android
8 and newer use an adaptive icon with the same house/circle paths on the cream
background. The foreground is inset into the adaptive-icon safe area so Samsung
and other launcher masks do not crop the mark. Both normal and round launcher
resources resolve to the Radhouse icon.
