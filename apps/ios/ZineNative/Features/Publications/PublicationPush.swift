import Foundation
import Observation
import UIKit
import UserNotifications

extension Notification.Name {
    static let zinePublicationAuthCancelled = Notification.Name("app.zine.publicationAuthCancelled")
    static let zinePublicationPushOpened = Notification.Name("app.zine.publicationPushOpened")
}

@Observable @MainActor
final class PublicationPush {
    static let shared = PublicationPush()
    var status = "Push is optional. New issues always appear in Activity."
    private var client: APIClient?
    private var userID: String?
    private var token: String?
    private var pendingDestination: PublicationDestination?
    private var installationID: String {
        let key = "zine.publication.pushInstallation.\(client?.baseURL.absoluteString ?? "").\(userID ?? "")"
        if let id = UserDefaults.standard.string(forKey: key) { return id }
        let id = publicationID(); UserDefaults.standard.set(id, forKey: key); return id
    }
    func configure(client: APIClient, userID: String?) async {
        self.client = client; self.userID = userID
        guard userID != nil else { return }
        // First setup only; travel must not silently change the saved delivery timezone.
        // Only initialize when the server has no preference (never overwrite another device).
        let timezoneKey = "zine.publication.deliveryZone.\(client.baseURL.absoluteString).\(userID ?? "")"
        if !UserDefaults.standard.bool(forKey: timezoneKey) {
            do {
                let current: PublicationValue = try await client.publicationRequest("me/publication-delivery-preferences")
                if case .object(let root) = current, case .object(let preferences) = root["preferences"],
                   preferences["configured"] == .bool(false) {
                    let _: PublicationValue = try await client.publicationRequest("me/publication-delivery-preferences", method: "PUT", body: .object(["timezone": .string(TimeZone.current.identifier), "initializeOnly": .bool(true)]))
                }
                UserDefaults.standard.set(true, forKey: timezoneKey)
            } catch { }
        }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
            UIApplication.shared.registerForRemoteNotifications(); await register()
        }
        if let destination = pendingDestination { pendingDestination = nil; route(destination) }
    }
    func requestPermission(client: APIClient, userID: String?) async {
        self.client = client; self.userID = userID
        guard userID != nil else { status = "Sign in to enable push notifications."; return }
        do {
            let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            status = allowed ? "Notifications enabled. Registering this device…" : "Push is off. You can change this in iOS Settings; Activity remains available."
            if allowed { UIApplication.shared.registerForRemoteNotifications(); await register() }
        } catch { status = "Couldn’t enable notifications: \(error.localizedDescription)" }
    }
    func receivedToken(_ data: Data) async {
        token = data.map { String(format: "%02x", $0) }.joined(); await register()
    }
    private func register() async {
        guard userID != nil, let client, let token else { return }
        guard let environment = PublicationPushEnvironment.current else {
            status = "Push signing configuration needs attention. Activity is still available."
            return
        }
        do {
            let _: PublicationValue = try await client.publicationRequest("me/push-installations/\(installationID)", method: "PUT", body: .object(["token": .string(token), "environment": .string(environment)]))
            status = "Push notifications enabled."
        } catch { status = "Device registration needs retry. Activity is still available." }
    }
    func revoke() async {
        guard let client, userID != nil else { return }
        let _: PublicationValue? = try? await client.publicationRequest("me/push-installations/\(installationID)", method: "DELETE")
        userID = nil; self.client = nil
        UIApplication.shared.unregisterForRemoteNotifications()
    }
    func opened(_ values: [AnyHashable: Any]) {
        let issueIDs = values["issueIds"] as? [String] ?? []
        let rawID = values["issueId"] as? String ?? (issueIDs.count == 1 ? issueIDs[0] : nil)
        let publicationID = values["publicationId"] as? String
        let path = rawID.map { "i/\($0)" } ?? publicationID.map { "p/\($0)" }
        guard let path, let destination = PublicationDestination.parse(PublicationLinks.url(path)) else { return }
        pendingDestination = destination; route(destination)
    }
    private func route(_ destination: PublicationDestination) {
        NotificationCenter.default.post(name: .zinePublicationPushOpened, object: destination)
    }
}

final class PublicationAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in await PublicationPush.shared.receivedToken(deviceToken) }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PublicationPush.shared.status = "This device couldn’t register for push. Activity is available in the app." }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        await MainActor.run { PublicationPush.shared.opened(response.notification.request.content.userInfo) }
    }
}
