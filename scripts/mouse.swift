// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Real mouse input for testing drags: WebDriver pointer actions never start
// a drag, since Firefox's tab drag is an OS drag session. This posts HID
// events through CGEvent, so macOS runs a true session and Koi behaves as
// under a hand. Events land on whatever is frontmost, so `activate` the
// instance first and check `front` before each one. Needs Accessibility
// trust for the terminal (`trusted` says). Points, top-left origin: the
// space of CGWindowListCopyWindowInfo, screencapture -R and Gecko's
// window.mozInnerScreenX/Y.
//
//   swiftc -O -o /tmp/mouse scripts/mouse.swift
//   /tmp/mouse trusted | activate PID | front PID | pos | move X Y
//              | down X Y | drag X Y [steps] | up | click X Y
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

let a = CommandLine.arguments
func post(_ type: CGEventType, _ p: CGPoint) {
  let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)!
  e.post(tap: .cghidEventTap)
}
func point(_ i: Int) -> CGPoint { CGPoint(x: Double(a[i])!, y: Double(a[i + 1])!) }
var cursor: CGPoint { CGEvent(source: nil)!.location }
func stepTo(_ to: CGPoint, _ type: CGEventType, steps: Int) {
  let from = cursor
  for i in 1...steps {
    let t = Double(i) / Double(steps)
    post(type, CGPoint(x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t))
    usleep(16_000)
  }
}
switch a[1] {
case "trusted":
  print(AXIsProcessTrusted())
case "activate":
  let app = NSRunningApplication(processIdentifier: pid_t(a[2])!)
  app?.activate(options: [.activateIgnoringOtherApps])
  usleep(300_000)
  print(NSWorkspace.shared.frontmostApplication?.processIdentifier == app?.processIdentifier)
case "front":
  print(NSWorkspace.shared.frontmostApplication?.processIdentifier == pid_t(a[2])!)
case "pos":
  print(Int(cursor.x), Int(cursor.y))
case "move":
  stepTo(point(2), .mouseMoved, steps: 6)
case "down":
  let p = point(2)
  stepTo(p, .mouseMoved, steps: 6)
  usleep(80_000)
  post(.leftMouseDown, p)
case "drag":
  stepTo(point(2), .leftMouseDragged, steps: a.count > 4 ? Int(a[4])! : 14)
case "up":
  post(.leftMouseUp, cursor)
case "click":
  let p = point(2)
  stepTo(p, .mouseMoved, steps: 6)
  usleep(80_000)
  post(.leftMouseDown, p)
  usleep(60_000)
  post(.leftMouseUp, p)
default:
  print("mouse trusted | move X Y | down X Y | drag X Y [steps] | up | click X Y")
}
