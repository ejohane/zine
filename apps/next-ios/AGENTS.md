# Zine Next

Erik explicitly requested a standalone replacement experience in this app.
This is an exception to the repository’s default `apps/ios` client direction.

- Own target `ZineNext`, bundle `app.zine.next`, product `Zine Next`.
- No runtime implementation imports, packages, auth, or persistence from the
  existing clients or services. The intended backend is now the independent
  `apps/api` `/v1` contract. This pass mocks it locally; it makes no authenticated
  requests. A build-time fixture validator may read its response schemas.
- Bundled sample metadata and artwork may come from the existing local Zine dev
  snapshot, as Erik requested. Import no account state, credentials, or backend
  dependencies. Do not provision production data for this app.
- Use SwiftUI, semantic `NextTheme` roles, Dynamic Type, and native navigation.
- Primary design target: open iPhone Duo in landscape. Preserve the pinned
  Home/Podcasts/Articles/Videos/Posts strip; only it accepts horizontal scrubbing.
  Use one icon + one label per filter, floating native glass over the content.
  Main content scrolls vertically as one page, without a persistent two-column
  split. Selection changes emit one haptic tick.
- Build with Xcode 27.1 or newer. Default Xcode on this host may be older.
- Generate the independent project with `xcodegen generate --spec apps/next-ios/project.yml`.
- Build/test this project, not the legacy app or its development stack.
- Live gesture claims require direct computer-use interaction. Render tests prove
  composition only. Physical haptic feel requires Erik’s phone.
