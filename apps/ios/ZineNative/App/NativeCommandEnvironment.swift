import SwiftUI

private struct NativeCommandSessionKey: EnvironmentKey {
    static let defaultValue: NativeCommandSession? = nil
}

extension EnvironmentValues {
    var nativeCommandSession: NativeCommandSession? {
        get { self[NativeCommandSessionKey.self] }
        set { self[NativeCommandSessionKey.self] = newValue }
    }
}
