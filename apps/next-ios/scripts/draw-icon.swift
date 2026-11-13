import AppKit
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
                              bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                              isPlanar: false, colorSpaceName: .deviceRGB,
                              bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(srgbRed: 0.21, green: 0.325, blue: 0.784, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: 1024, height: 1024).fill()
let mark = NSBezierPath()
mark.move(to: NSPoint(x: 310, y: 250))
mark.line(to: NSPoint(x: 310, y: 766))
mark.curve(to: NSPoint(x: 358, y: 814), controlPoint1: NSPoint(x: 310, y: 798), controlPoint2: NSPoint(x: 326, y: 814))
mark.line(to: NSPoint(x: 666, y: 814))
mark.curve(to: NSPoint(x: 714, y: 766), controlPoint1: NSPoint(x: 698, y: 814), controlPoint2: NSPoint(x: 714, y: 798))
mark.line(to: NSPoint(x: 714, y: 250))
mark.line(to: NSPoint(x: 512, y: 390))
mark.close()
NSColor.white.setFill(); mark.fill()
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
