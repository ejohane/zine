// swift-tools-version: 5.10
import PackageDescription

// Compile the canonical app sources directly: no copies and no replacement network client.
let package = Package(
    name: "ZineCore",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [
        .library(name: "ZineCore", targets: ["ZineCore"]),
        .executable(name: "zine-native", targets: ["NativeCLI"]),
    ],
    targets: [
        .testTarget(
            name: "NativePersistenceTests", dependencies: ["ZineCore"], path: "ZineNativeTests",
            sources: ["LibraryCacheTests.swift", "OfflineBookmarkMutationOutboxTests.swift"]),
        .executableTarget(name: "NativeCLI", dependencies: ["ZineCore"], path: "NativeCLI"),
        .target(
            name: "ZineCore", path: "ZineNative",
            exclude: [
                "App", "Core/ContentTypeFilterBar.swift", "Core/FilteredListTabAction.swift", "Core/Images",
                "Core/Persistence/EditorialIssueCache.swift", "Core/Persistence/HomeCache.swift",
                "Core/Persistence/InboxCache.swift", "Core/Persistence/OfflineLibrarySynchronizer.swift",
                "Core/Persistence/PeopleDailyCache.swift", "Core/Share", "Core/ZineTheme.swift",
                "Features/Creators", "Features/Home", "Features/Inbox",
                "Features/Library/ActionRowHaptic.swift", "Features/Library/BookmarkDescription.swift",
                "Features/Library/BookmarkDetailView.swift", "Features/Library/BookmarkRow.swift",
                "Features/Library/CreatorAvatar.swift", "Features/Library/LibraryView.swift",
                "Features/Library/ProviderOpenButton.swift", "Features/Library/ScreenshotLibraryView.swift",
                "Features/Library/YouTubeDescriptionChapters.swift", "Features/Reader/ArticleHTMLView.swift",
                "Features/Reader/ArticleReaderView.swift",
                "Features/Reader/ScreenshotArticleReaderView.swift", "Features/Settings",
                "Features/Subscriptions/NewsletterSubscriptionsView.swift",
                "Features/Subscriptions/ProviderOAuthSession.swift",
                "Features/Subscriptions/ProviderSubscriptionsClient.swift",
                "Features/Subscriptions/ProviderSubscriptionsStore.swift",
                "Features/Subscriptions/ProviderSubscriptionsView.swift",
                "Features/Subscriptions/RssSubscriptionsView.swift",
                "Features/Subscriptions/SourceManagementComponents.swift",
                "Features/Subscriptions/SubscriptionsView.swift",
                "Features/Subscriptions/XSubscriptionsView.swift", "Features/Today", "Resources",
            ],
            sources: [
                "Core/API", "Core/Automation", "Core/Models", "Core/Persistence/ArticleBodyCache.swift",
                "Core/Persistence/LibraryCache.swift", "Core/Persistence/OfflineBookmarkMutationOutbox.swift",
                "Features/Library/LibraryStore.swift", "Features/Reader/ArticleReaderStore.swift",
                "Features/Subscriptions/SubscriptionModels.swift",
            ]),
        .testTarget(name: "ZineCoreTests", dependencies: ["ZineCore"], path: "CoreTests"),
    ]
)
