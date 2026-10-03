import AuthenticationServices
import ClerkKit
import ClerkKitUI
import CryptoKit
import SwiftUI

/// Zine's first signed-out screen.
struct ZineAuthEntryView: View {
    private enum Mode {
        case signIn
        case signUp
    }

    private enum AuthRoute: Identifiable {
        case email(ZineEmailAuthFlowView.Mode, String)
        case socialContinuation

        var id: String {
            switch self {
            case .email(let mode, let identifier): return "email-\(mode)-\(identifier)"
            case .socialContinuation: return "social-continuation"
            }
        }
    }

    @Environment(Clerk.self) private var clerk
    @Environment(\.colorScheme) private var colorScheme

    @State private var mode: Mode = .signIn
    @State private var emailAddress = ""
    @State private var authRoute: AuthRoute?
    @State private var isAuthenticating = false
    @State private var errorMessage: String?
    @FocusState private var emailIsFocused: Bool

    private var isSignUp: Bool { mode == .signUp }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                let isCompact = geometry.size.height < 720

                VStack(spacing: 0) {
                    if isSignUp {
                        signUpHeading(compact: isCompact)
                    } else {
                        signInHeading(compact: isCompact)
                    }

                    authenticationChoices

                    Spacer(minLength: 0)

                    accountSwitch
                }
                .padding(.horizontal, 25)
                .padding(.top, isSignUp || isCompact ? 10 : 68)
                .padding(.bottom, isCompact ? 16 : 32)
                .frame(maxWidth: 440)
                .frame(maxWidth: .infinity)
                .frame(height: geometry.size.height, alignment: .top)
                .background(ZineTheme.canvas.ignoresSafeArea())
            }
            .toolbar(isSignUp ? .visible : .hidden, for: .navigationBar)
            .toolbar {
                if isSignUp {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Back", systemImage: "chevron.left") {
                            switchMode(to: .signIn)
                        }
                        .foregroundStyle(ZineTheme.primaryText)
                    }
                }
            }
        }
        .fullScreenCover(item: $authRoute) { route in
            switch route {
            case .email(let mode, let identifier):
                ZineEmailAuthFlowView(mode: mode, emailAddress: identifier)
            case .socialContinuation:
                AuthView(mode: .signInOrUp)
                    .tint(ZineTheme.brandAccent)
            }
        }
        .alert("Couldn’t continue", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "Please try again.")
        }
    }

    private func signInHeading(compact: Bool) -> some View {
        VStack(spacing: 14) {
            zineMark(size: 70)
            Text("Welcome to Zine.")
                .font(.system(size: 31, weight: .bold, design: .default))
                .tracking(-1.5)
                .foregroundStyle(ZineTheme.primaryText)
                .minimumScaleFactor(0.8)
                .lineLimit(1)
            Text("A home for what you follow.")
                .font(.system(size: 15))
                .foregroundStyle(ZineTheme.secondaryText)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, compact ? 24 : 46)
        .accessibilityElement(children: .combine)
    }

    private func signUpHeading(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            zineMark(size: 43)
                .padding(.bottom, 23)

            Text("START YOUR ZINE")
                .font(.system(size: 10, weight: .bold))
                .tracking(1.6)
                .foregroundStyle(ZineTheme.brandAccent)
                .padding(.bottom, 10)

            Text("Create your account.")
                .font(.system(size: 33, weight: .bold))
                .tracking(-1.5)
                .foregroundStyle(ZineTheme.primaryText)
                .minimumScaleFactor(0.75)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, compact ? 20 : 36)
    }

    private var authenticationChoices: some View {
        VStack(alignment: .leading, spacing: 10) {
            if providerIsAvailable(.apple) {
                SignInWithAppleButton(isSignUp ? .signUp : .signIn) { request in
                    SourcesOnboardingProgress.recordAuthAttempt()
                    request.requestedScopes = [.email, .fullName]
                    request.nonce = appleRequestNonce()
                } onCompletion: { result in
                    handleAppleAuthorization(result)
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 50)
                .overlay {
                    providerButtonLabel(
                        isSignUp ? "Sign up with Apple" : "Sign in with Apple",
                        logo: Image(systemName: "apple.logo")
                            .font(.system(size: 20)),
                        foreground: colorScheme == .dark ? .black : .white,
                        background: colorScheme == .dark ? .white : .black,
                        border: .clear
                    )
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
                .clipShape(RoundedRectangle(cornerRadius: 13))
                .id("\(isSignUp)-\(colorScheme == .dark)")
                .disabled(isAuthenticating || clerk.environment == nil)
            }

            if providerIsAvailable(.google) {
                Button {
                    Task { await authenticateWithGoogle() }
                } label: {
                    providerButtonLabel(
                        isSignUp ? "Sign up with Google" : "Sign in with Google",
                        logo: Image("GoogleG")
                            .resizable()
                            .scaledToFit(),
                        foreground: Color(red: 31 / 255, green: 31 / 255, blue: 31 / 255),
                        background: .white,
                        border: Color(red: 116 / 255, green: 119 / 255, blue: 117 / 255)
                    )
                }
                .disabled(isAuthenticating || clerk.environment == nil)
            }

            HStack(spacing: 10) {
                Rectangle().frame(height: 1)
                Text("OR CONTINUE WITH EMAIL")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .fixedSize()
                Rectangle().frame(height: 1)
            }
            .foregroundStyle(ZineTheme.secondaryText)
            .padding(.vertical, 10)

            Text("Email address")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(ZineTheme.primaryText)

            TextField(
                "",
                text: $emailAddress,
                prompt: Text(verbatim: "you@example.com")
                    .foregroundStyle(ZineTheme.tertiaryText)
            )
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 17))
                .padding(.horizontal, 15)
                .frame(height: 52)
                .background(ZineTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 13))
                .overlay {
                    RoundedRectangle(cornerRadius: 13)
                        .strokeBorder(ZineTheme.border, lineWidth: 1)
                }
                .submitLabel(.continue)
                .focused($emailIsFocused)
                .onSubmit(continueWithEmail)

            Button(action: continueWithEmail) {
                Text("Continue with email")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
            }
            .foregroundStyle(ZineTheme.onAccent)
            .background(ZineTheme.brandAccent)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.top, 4)
            .disabled(clerk.environment == nil)

            if isAuthenticating {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }

            if isSignUp && SourcesOnboardingReplayAccess.isAvailable(email: emailAddress) {
                Button("Sign in to preview source setup") {
                    emailIsFocused = false
                    SourcesOnboardingReplayAccess.requestPreview()
                    authRoute = .email(.signIn, emailAddress.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(ZineTheme.inlineLink)
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(clerk.environment == nil)
                .accessibilityIdentifier("signup-preview-source-setup")
            }
        }
    }

    private var accountSwitch: some View {
        HStack(spacing: 4) {
            Text(isSignUp ? "Already have an account?" : "New to Zine?")
                .foregroundStyle(ZineTheme.secondaryText)
            Button(isSignUp ? "Sign in" : "Create account") {
                switchMode(to: isSignUp ? .signIn : .signUp)
            }
            .fontWeight(.bold)
            .foregroundStyle(ZineTheme.inlineLink)
            .frame(minHeight: 44)
        }
        .font(.system(size: 15))
        .frame(maxWidth: .infinity)
    }

    private func providerButtonLabel<Logo: View>(
        _ title: String,
        logo: Logo,
        foreground: Color,
        background: Color,
        border: Color
    ) -> some View {
        ZStack {
            Text(title)
                .font(.system(size: 17, weight: .semibold))
                .frame(maxWidth: .infinity)

            HStack {
                logo
                    .frame(width: 19, height: 19)
                Spacer()
            }
            .padding(.leading, 17)
        }
        .foregroundStyle(foreground)
        .frame(height: 50)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 13))
        .overlay {
            RoundedRectangle(cornerRadius: 13)
                .strokeBorder(border, lineWidth: 1)
        }
    }

    private func zineMark(size: CGFloat) -> some View {
        Image("ZineMark")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .background(.black)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.24))
            .accessibilityHidden(true)
    }

    private func switchMode(to newMode: Mode) {
        emailIsFocused = false
        mode = newMode
        emailAddress = ""
        errorMessage = nil
    }

    private func continueWithEmail() {
        guard clerk.environment != nil else { return }
        let identifier = emailAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !identifier.isEmpty else {
            emailIsFocused = true
            return
        }
        guard identifier.contains("@"), identifier.split(separator: "@").count == 2,
              identifier.split(separator: "@")[1].contains(".") else {
            errorMessage = "Enter a valid email address."
            emailIsFocused = true
            return
        }
        SourcesOnboardingProgress.recordAuthAttempt()
        authRoute = .email(isSignUp ? .signUp : .signIn, identifier)
    }

    private func providerIsAvailable(_ provider: OAuthProvider) -> Bool {
        guard let environment = clerk.environment else { return true }
        return environment.userSettings.social.values.contains {
            $0.strategy == provider.strategy && $0.enabled && $0.authenticatable
        }
    }

    private func authenticateWithGoogle() async {
        guard !isAuthenticating else { return }
        SourcesOnboardingProgress.recordAuthAttempt()
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            let result = if isSignUp {
                try await clerk.auth.signUpWithOAuth(provider: .google)
            } else {
                try await clerk.auth.signInWithOAuth(provider: .google)
            }
            continueIfNeeded(result)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func handleAppleAuthorization(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8) else {
                errorMessage = "Apple didn’t return an identity token. Please try again."
                return
            }
            isAuthenticating = true
            Task {
                defer { isAuthenticating = false }
                do {
                    let canCreateAccount = clerk.environment?.userSettings.signUp.mode == "public"
                    let result = if isSignUp || canCreateAccount {
                        try await clerk.auth.signUpWithIdToken(
                            token,
                            provider: .apple,
                            firstName: credential.fullName?.givenName,
                            lastName: credential.fullName?.familyName
                        )
                    } else {
                        try await clerk.auth.signInWithIdToken(
                            token,
                            provider: .apple,
                            transferable: false
                        )
                    }
                    continueIfNeeded(result)
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        case .failure(let error):
            if let authorizationError = error as? ASAuthorizationError {
                guard authorizationError.code != .canceled else { return }
                errorMessage = "Apple sign-in isn’t available on this device. Check your Apple Account in Settings and try again."
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func appleRequestNonce() -> String {
        let randomBytes = Data((0 ..< 32).map { _ in UInt8.random(in: .min ... .max) })
        return Data(SHA256.hash(data: randomBytes))
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func continueIfNeeded(_ result: TransferFlowResult) {
        let isComplete: Bool
        switch result {
        case .signIn(let signIn): isComplete = signIn.status == .complete
        case .signUp(let signUp): isComplete = signUp.status == .complete
        }
        if !isComplete {
            authRoute = .socialContinuation
        }
    }
}
