import AppKit
import ImageIO
import UniformTypeIdentifiers
let source = NSImage(contentsOfFile: CommandLine.arguments[1])!
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let size = Int(CommandLine.arguments[3])!
let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(red: 1, green: 248.0/255, blue: 229.0/255, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: size, height: size))
let graphics = NSGraphicsContext(cgContext: context, flipped: false)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = graphics
source.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()
let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
assert(CGImageDestinationFinalize(destination))
