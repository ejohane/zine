import ClerkKit
import SwiftUI
import UIKit

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        let configuration = ShareExtensionConfiguration.current
        let client: BookmarkShareClient

        if configuration.isValid {
            Clerk.configure(
                publishableKey: configuration.clerkPublishableKey,
                options: Clerk.Options(
                    telemetryEnabled: false,
                    keychainConfig: .init(
                        service: configuration.keychainService,
                        accessGroup: configuration.keychainAccessGroup
                    ),
                    redirectConfig: .init(
                        redirectUrl: "app.zine.native://callback",
                        callbackUrlScheme: "app.zine.native"
                    )
                )
            )

            client = .live(
                baseURL: configuration.apiBaseURL,
                tokenProvider: {
                    guard let token = try await Clerk.shared.auth.getToken() else {
                        throw BookmarkShareError.signedOut
                    }
                    return token
                }
            )
        } else {
            client = BookmarkShareClient(
                preview: { _ in throw BookmarkShareError.invalidConfiguration },
                listTags: { throw BookmarkShareError.invalidConfiguration },
                save: { _, _ in throw BookmarkShareError.invalidConfiguration }
            )
        }

        let store = BookmarkShareStore(
            loadURL: { [weak self] in
                try await ShareItemLoader.url(from: self?.extensionContext)
            },
            client: client
        )
        let host = UIHostingController(
            rootView: BookmarkShareView(
                store: store,
                onCancel: { [weak self] in self?.cancel() },
                onComplete: { [weak self] in self?.complete() }
            )
        )

        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)

        preferredContentSize = CGSize(width: 0, height: 640)
    }

    private func cancel() {
        extensionContext?.cancelRequest(
            withError: NSError(
                domain: NSCocoaErrorDomain,
                code: NSUserCancelledError
            )
        )
    }

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}

private struct ShareExtensionConfiguration {
    let apiBaseURL: URL
    let clerkPublishableKey: String
    let keychainService: String
    let keychainAccessGroup: String

    var isValid: Bool {
        !clerkPublishableKey.isEmpty
            && !clerkPublishableKey.contains("$(")
            && !keychainService.isEmpty
            && !keychainAccessGroup.isEmpty
    }

    static var current: ShareExtensionConfiguration {
        let values = Bundle.main.infoDictionary ?? [:]
        let baseURLString = values["ZINEAPIBaseURL"] as? String ?? "https://api.myzine.app"

        return ShareExtensionConfiguration(
            apiBaseURL: URL(string: baseURLString) ?? URL(string: "https://api.myzine.app")!,
            clerkPublishableKey: values["ZINEClerkPublishableKey"] as? String ?? "",
            keychainService: values["ZINEKeychainService"] as? String ?? "app.zine.native",
            keychainAccessGroup: values["ZINEKeychainAccessGroup"] as? String ?? ""
        )
    }
}
