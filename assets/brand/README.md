# Mobile app mark

`favicon.svg` is copied unchanged from Radhouse's canonical `brand/favicon.svg`.
The iOS icon uses that mark on a full, opaque cream background; iOS applies the
device's icon mask. No new logo or colour palette is introduced.

On macOS, `swift assets/brand/render-icon.swift assets/brand/favicon.svg OUTPUT.png
1024` renders an opaque sRGB master using AppKit. Resize the master to the pixel
sizes listed in `ios/RadhouseMobile/Images.xcassets/AppIcon.appiconset/Contents.json`
with `sips -z SIZE SIZE OUTPUT.png --out DESTINATION.png`.
