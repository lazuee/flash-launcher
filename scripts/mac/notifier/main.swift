import AppKit
import Foundation

struct NotificationOptions {
    var title = "Installation complete"
    var content = "Ready in /Applications."
    var revealPath: String?
    var duration: TimeInterval = 4.5
}

func parseOptions() -> NotificationOptions {
    var options = NotificationOptions()
    let arguments = Array(CommandLine.arguments.dropFirst())
    var index = 0

    while index < arguments.count {
        let argument = arguments[index]
        index += 1

        guard index < arguments.count else {
            break
        }

        let value = arguments[index]

        switch argument {
        case "-title", "--title":
            options.title = value
            index += 1
        case "-content", "--content", "-message", "--message":
            options.content = value
            index += 1
        case "-reveal", "--reveal", "--reveal-path":
            options.revealPath = value
            index += 1
        case "-duration", "--duration":
            options.duration = TimeInterval(value) ?? options.duration
            index += 1
        default:
            continue
        }
    }

    return options
}

class AppDelegate: NSObject, NSApplicationDelegate {
    private let title: String
    private let content: String
    private let revealPath: String?
    private let duration: TimeInterval
    private var notificationManager: NotificationManager?

    init(title: String, content: String, revealPath: String?, duration: TimeInterval) {
        self.title = title
        self.content = content
        self.revealPath = revealPath
        self.duration = duration
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        notificationManager = NotificationManager(
            title: title,
            content: content,
            revealPath: revealPath,
            duration: duration
        )

        notificationManager?.sendNotification { [weak self] in
            self?.terminateApp()
        }
    }

    private func terminateApp() {
        DispatchQueue.main.async {
            NSApplication.shared.terminate(nil)
        }
    }
}

final class NotificationManager: NSObject, NSUserNotificationCenterDelegate {
    private let title: String
    private let content: String
    private let revealPath: String?
    private let duration: TimeInterval
    private var completionHandler: (() -> Void)?
    private var didFinish = false

    init(title: String, content: String, revealPath: String?, duration: TimeInterval) {
        self.title = title
        self.content = content
        self.revealPath = revealPath
        self.duration = duration
        super.init()
    }

    func sendNotification(completion: @escaping () -> Void) {
        completionHandler = completion
        let center = NSUserNotificationCenter.default
        center.delegate = self

        let notification = NSUserNotification()
        notification.title = title
        notification.informativeText = content
        notification.soundName = nil
        notification.hasActionButton = true
        notification.actionButtonTitle = "Show"
        notification.otherButtonTitle = "Close"

        center.deliver(notification)

        if revealPath == nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + max(duration, 0.5)) { [weak self] in
                self?.finish()
            }
        }
    }

    func userNotificationCenter(
        _ center: NSUserNotificationCenter,
        shouldPresent notification: NSUserNotification
    ) -> Bool {
        true
    }

    func userNotificationCenter(
        _ center: NSUserNotificationCenter,
        didActivate notification: NSUserNotification
    ) {
        if let revealPath {
            let expandedPath = (revealPath as NSString).expandingTildeInPath
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: expandedPath)])
        }

        finish()
    }

    private func finish() {
        guard !didFinish else {
            return
        }

        didFinish = true
        completionHandler?()
    }
}

struct MacOSNotifier {
    static func main() {
        let options = parseOptions()
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)

        let delegate = AppDelegate(
            title: options.title,
            content: options.content,
            revealPath: options.revealPath,
            duration: options.duration
        )
        app.delegate = delegate
        app.run()
    }
}

MacOSNotifier.main()
