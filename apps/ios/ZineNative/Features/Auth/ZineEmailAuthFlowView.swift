import ClerkKit
import SwiftUI

/// Email authentication stays in Zine while Clerk handles identities and sessions.
struct ZineEmailAuthFlowView: View {
    enum Mode { case signIn, signUp }

    private enum Step {
        case loading, password, createPassword, emailCode, resetCode, newPassword
        case secondFactor, secondFactorOptions, additionalDetails
    }

    @Environment(Clerk.self) private var clerk
    @Environment(\.dismiss) private var dismiss

    let mode: Mode
    let emailAddress: String

    @State private var step: Step = .loading
    @State private var signIn: SignIn?
    @State private var signUp: SignUp?
    @State private var password = ""
    @State private var confirmation = ""
    @State private var code = ""
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var username = ""
    @State private var acceptedTerms = false
    @State private var secondFactorType: SignIn.MfaType?
    @State private var isWorking = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case password, confirmation, code, firstName, lastName, username }

    private var passwordIsEnabled: Bool {
        clerk.environment?.userSettings.attributes["password"]?.enabled == true
    }

    private var legalConsentIsEnabled: Bool {
        clerk.environment?.userSettings.signUp.legalConsentEnabled == true
    }

    private var isBackupCode: Bool {
        if case .backupCode? = secondFactorType { return true }
        return false
    }

    private var canResendSecondFactor: Bool {
        if case .emailCode? = secondFactorType { return true }
        if case .phoneCode? = secondFactorType { return true }
        return false
    }

    private var supportedSecondFactors: [Factor] {
        (signIn?.supportedSecondFactors ?? []).filter {
            [.emailCode, .phoneCode, .totp, .backupCode].contains($0.strategy)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Image("ZineMark")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 48, height: 48)
                        .background(.black)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.bottom, 30)

                    Text(title)
                        .font(.system(size: 32, weight: .bold))
                        .tracking(-1.3)
                        .foregroundStyle(ZineTheme.primaryText)
                        .padding(.bottom, 9)

                    Text(subtitle)
                        .font(.system(size: 16))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .padding(.bottom, 30)

                    content

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 14))
                            .foregroundStyle(.red)
                            .padding(.top, 18)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                }
                .frame(maxWidth: 440, alignment: .leading)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 25)
                .padding(.top, 30)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(ZineTheme.canvas.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Back", systemImage: "chevron.left") { goBack() }
                        .foregroundStyle(ZineTheme.primaryText)
                }
            }
        }
        .task { await start() }
    }

    private var title: String {
        switch step {
        case .loading: return errorMessage == nil ? "One moment…" : "Check your email."
        case .password: return "Enter your password."
        case .createPassword: return "Create a password."
        case .emailCode: return mode == .signUp ? "Verify your email." : "Check your email."
        case .resetCode: return "Reset your password."
        case .newPassword: return "Set a new password."
        case .secondFactor, .secondFactorOptions: return "One more step."
        case .additionalDetails: return "Finish your account."
        }
    }

    private var subtitle: String {
        switch step {
        case .loading: return errorMessage == nil ? "Getting things ready for \(emailAddress)." : emailAddress
        case .password, .createPassword, .additionalDetails: return emailAddress
        case .emailCode, .resetCode: return "Enter the code we sent to \(emailAddress)."
        case .newPassword: return "Choose a new password for \(emailAddress)."
        case .secondFactor: return "Enter your verification code to continue."
        case .secondFactorOptions: return "Choose how to verify your account."
        }
    }

    @ViewBuilder private var content: some View {
        switch step {
        case .loading:
            if errorMessage == nil {
                ProgressView().frame(maxWidth: .infinity)
            } else {
                primaryButton("Try again") { await start() }
            }
        case .password:
            passwordField("Password", contentType: .password)
            primaryButton("Sign in") { await submitPassword() }
            Button("Forgot password?") { Task { await startPasswordReset() } }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(ZineTheme.inlineLink)
                .frame(maxWidth: .infinity, minHeight: 48)
            if signIn?.supportedFirstFactors?.contains(where: { $0.strategy == .emailCode }) == true {
                Button("Email me a sign-in code instead") { Task { await sendSignInCode() } }
                    .font(.system(size: 15))
                    .foregroundStyle(ZineTheme.inlineLink)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        case .createPassword:
            passwordField("Password", contentType: .newPassword)
            SecureField("Confirm password", text: $confirmation)
                .textContentType(.newPassword)
                .textInputAutocapitalization(.never)
                .focused($focusedField, equals: .confirmation)
                .modifier(AuthInputStyle())
                .padding(.top, 12)
            if legalConsentIsEnabled { legalConsent }
            primaryButton("Create account") { await createAccount() }
        case .emailCode, .resetCode, .secondFactor:
            labeledField(
                isBackupCode ? "Backup code" : "Verification code",
                text: $code,
                contentType: .oneTimeCode,
                keyboard: isBackupCode ? .default : .numberPad
            )
                .focused($focusedField, equals: .code)
            primaryButton(step == .resetCode ? "Verify code" : "Continue") { await submitCode() }
            if step != .secondFactor {
                Button("Send a new code") { Task { await resendCode() } }
                    .font(.system(size: 15))
                    .foregroundStyle(ZineTheme.inlineLink)
                    .frame(maxWidth: .infinity, minHeight: 48)
            } else {
                if canResendSecondFactor {
                    Button("Send a new code") { Task { await resendSecondFactor() } }
                        .font(.system(size: 15))
                        .foregroundStyle(ZineTheme.inlineLink)
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                if supportedSecondFactors.count > 1 {
                    Button("Use another method") { step = .secondFactorOptions }
                        .font(.system(size: 15))
                        .foregroundStyle(ZineTheme.inlineLink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
        case .secondFactorOptions:
            ForEach(Array(supportedSecondFactors.enumerated()), id: \.offset) { _, factor in
                Button(secondFactorLabel(factor.strategy)) {
                    Task { await selectSecondFactor(factor.strategy) }
                }
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(ZineTheme.primaryText)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .padding(.horizontal, 15)
                .background(ZineTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 13))
                .overlay { RoundedRectangle(cornerRadius: 13).strokeBorder(ZineTheme.border) }
                .padding(.bottom, 10)
            }
        case .newPassword:
            passwordField("New password", contentType: .newPassword)
            SecureField("Confirm password", text: $confirmation)
                .textContentType(.newPassword)
                .textInputAutocapitalization(.never)
                .focused($focusedField, equals: .confirmation)
                .modifier(AuthInputStyle())
                .padding(.top, 12)
            primaryButton("Save new password") { await saveNewPassword() }
        case .additionalDetails:
            additionalDetailsFields
            primaryButton("Continue") { await saveAdditionalDetails() }
        }
    }

    private func passwordField(_ label: String, contentType: UITextContentType) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(label).font(.system(size: 14, weight: .medium))
                .foregroundStyle(ZineTheme.primaryText)
            SecureField(label, text: $password)
                .textContentType(contentType)
                .textInputAutocapitalization(.never)
                .focused($focusedField, equals: .password)
                .modifier(AuthInputStyle())
        }
    }

    private func labeledField(
        _ label: String, text: Binding<String>, contentType: UITextContentType? = nil,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(label).font(.system(size: 14, weight: .medium))
                .foregroundStyle(ZineTheme.primaryText)
            TextField(label, text: text)
                .textContentType(contentType)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .modifier(AuthInputStyle())
        }
    }

    private func primaryButton(_ title: String, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            HStack {
                if isWorking { ProgressView().tint(ZineTheme.onAccent) }
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .foregroundStyle(ZineTheme.onAccent)
        .background(ZineTheme.brandAccent)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .disabled(isWorking)
        .padding(.top, 24)
    }

    @ViewBuilder private var additionalDetailsFields: some View {
        if signUp?.missingFields.contains(.firstName) == true {
            labeledField("First name", text: $firstName)
                .focused($focusedField, equals: .firstName)
                .padding(.bottom, 14)
        }
        if signUp?.missingFields.contains(.lastName) == true {
            labeledField("Last name", text: $lastName)
                .focused($focusedField, equals: .lastName)
                .padding(.bottom, 14)
        }
        if signUp?.missingFields.contains(.username) == true {
            labeledField("Username", text: $username)
                .focused($focusedField, equals: .username)
                .padding(.bottom, 14)
        }
        if signUp?.missingFields.contains(.legalAccepted) == true {
            legalConsent
        }
    }

    private var legalConsent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle("I agree to the terms", isOn: $acceptedTerms)
                .tint(ZineTheme.brandAccent)
            HStack(spacing: 16) {
                if let value = clerk.environment?.displayConfig.termsUrl,
                   let url = URL(string: value) {
                    Link("Terms of Service", destination: url)
                }
                if let value = clerk.environment?.displayConfig.privacyPolicyUrl,
                   let url = URL(string: value) {
                    Link("Privacy Policy", destination: url)
                }
            }
            .font(.system(size: 13))
            .foregroundStyle(ZineTheme.inlineLink)
        }
        .padding(.top, 18)
    }

    private func start() async {
        guard step == .loading else { return }
        if mode == .signUp {
            step = passwordIsEnabled ? .createPassword : .loading
            if !passwordIsEnabled { await createAccount() }
            return
        }
        await perform {
            let attempt = try await clerk.auth.signIn(emailAddress)
            signIn = attempt
            await advance(attempt)
        }
    }

    private func createAccount() async {
        guard !passwordIsEnabled || !password.isEmpty else {
            errorMessage = "Enter a password to continue."
            focusedField = .password
            return
        }
        guard !passwordIsEnabled || password == confirmation else {
            errorMessage = "Passwords must match."
            focusedField = .confirmation
            return
        }
        guard !legalConsentIsEnabled || acceptedTerms else {
            errorMessage = "Accept the terms to continue."
            return
        }
        await perform {
            let attempt: SignUp
            if let signUp {
                attempt = try await signUp.update(password: password)
            } else {
                attempt = try await clerk.auth.signUp(
                    emailAddress: emailAddress,
                    password: passwordIsEnabled ? password : nil,
                    legalAccepted: legalConsentIsEnabled ? acceptedTerms : nil
                )
            }
            password = ""
            confirmation = ""
            signUp = attempt
            await advance(attempt)
        }
    }

    private func submitPassword() async {
        guard let signIn, !password.isEmpty else {
            errorMessage = "Enter your password to continue."
            focusedField = .password
            return
        }
        await perform {
            let attempt = try await signIn.authenticateWithPassword(password)
            password = ""
            self.signIn = attempt
            await advance(attempt)
        }
    }

    private func sendSignInCode() async {
        guard let signIn else { return }
        await perform {
            let attempt = try await signIn.sendEmailCode()
            self.signIn = attempt
            code = ""
            step = .emailCode
        }
    }

    private func startPasswordReset() async {
        guard let signIn else { return }
        await perform {
            let attempt = try await signIn.sendResetPasswordEmailCode()
            self.signIn = attempt
            code = ""
            step = .resetCode
        }
    }

    private func submitCode() async {
        guard !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Enter the verification code."
            focusedField = .code
            return
        }
        await perform {
            switch step {
            case .emailCode where mode == .signUp:
                guard let signUp else { return }
                let attempt = try await signUp.verifyEmailCode(code)
                self.signUp = attempt
                await advance(attempt)
            case .emailCode, .resetCode:
                guard let signIn else { return }
                let attempt = try await signIn.verifyCode(code)
                self.signIn = attempt
                if step == .resetCode { step = .newPassword }
                else { await advance(attempt) }
            case .secondFactor:
                guard let signIn, let secondFactorType else { return }
                let attempt = try await signIn.verifyMfaCode(code, type: secondFactorType)
                self.signIn = attempt
                await advance(attempt)
            default: break
            }
        }
    }

    private func resendCode() async {
        await perform {
            switch step {
            case .emailCode where mode == .signUp:
                guard let signUp else { return }
                self.signUp = try await signUp.sendEmailCode()
            case .emailCode:
                guard let signIn else { return }
                self.signIn = try await signIn.sendEmailCode()
            case .resetCode:
                guard let signIn else { return }
                self.signIn = try await signIn.sendResetPasswordEmailCode()
            default: break
            }
            code = ""
        }
    }

    private func saveNewPassword() async {
        guard !password.isEmpty, password == confirmation else {
            errorMessage = "Passwords must match."
            return
        }
        guard let signIn else { return }
        await perform {
            let attempt = try await signIn.resetPassword(newPassword: password)
            password = ""
            confirmation = ""
            self.signIn = attempt
            await advance(attempt)
        }
    }

    private func saveAdditionalDetails() async {
        guard let signUp else { return }
        if signUp.missingFields.contains(.legalAccepted) && !acceptedTerms {
            errorMessage = "Accept the terms to continue."
            return
        }
        await perform {
            let attempt = try await signUp.update(
                firstName: signUp.missingFields.contains(.firstName) ? firstName : nil,
                lastName: signUp.missingFields.contains(.lastName) ? lastName : nil,
                username: signUp.missingFields.contains(.username) ? username : nil,
                legalAccepted: signUp.missingFields.contains(.legalAccepted) ? acceptedTerms : nil
            )
            self.signUp = attempt
            await advance(attempt)
        }
    }

    private func advance(_ attempt: SignUp) async {
        if attempt.status == .complete {
            await activate(attempt.createdSessionId)
        } else if attempt.unverifiedFields.contains(.emailAddress) {
            await perform {
                signUp = try await attempt.sendEmailCode()
                code = ""
                step = .emailCode
            }
        } else if attempt.missingFields.contains(where: { [.firstName, .lastName, .username, .legalAccepted].contains($0) }) {
            step = .additionalDetails
        } else if attempt.missingFields.contains(.password) {
            step = .createPassword
        } else {
            errorMessage = "This account needs another detail before it can be created. Please contact support."
        }
    }

    private func advance(_ attempt: SignIn) async {
        switch attempt.status {
        case .complete:
            await activate(attempt.createdSessionId)
        case .needsFirstFactor:
            if attempt.supportedFirstFactors?.contains(where: { $0.strategy == .password }) == true {
                step = .password
            } else if attempt.supportedFirstFactors?.contains(where: { $0.strategy == .emailCode }) == true {
                await sendSignInCode()
            } else {
                errorMessage = "This account uses another sign-in method. Go back and use Apple or Google."
            }
        case .needsSecondFactor:
            await prepareSecondFactor(attempt)
        case .needsNewPassword:
            step = .newPassword
        case .needsClientTrust:
            await prepareSecondFactor(attempt)
        case .needsIdentifier, .unknown:
            errorMessage = "We couldn’t continue with this email. Check it and try again."
        }
    }

    private func prepareSecondFactor(_ attempt: SignIn) async {
        let factors = attempt.supportedSecondFactors ?? []
        if factors.contains(where: { $0.strategy == .emailCode }) {
            await selectSecondFactor(.emailCode)
        } else if factors.contains(where: { $0.strategy == .phoneCode }) {
            await selectSecondFactor(.phoneCode)
        } else if factors.contains(where: { $0.strategy == .totp }) {
            await selectSecondFactor(.totp)
        } else if factors.contains(where: { $0.strategy == .backupCode }) {
            await selectSecondFactor(.backupCode)
        } else {
            errorMessage = "This account needs another verification method. Please contact support."
        }
    }

    private func secondFactorLabel(_ strategy: FactorStrategy) -> String {
        switch strategy {
        case .emailCode: return "Email a code"
        case .phoneCode: return "Text a code"
        case .totp: return "Authenticator app"
        case .backupCode: return "Backup code"
        default: return "Other method"
        }
    }

    private func selectSecondFactor(_ strategy: FactorStrategy) async {
        guard let signIn else { return }
        await perform {
            switch strategy {
            case .emailCode:
                self.signIn = try await signIn.sendMfaEmailCode()
                secondFactorType = .emailCode
            case .phoneCode:
                self.signIn = try await signIn.sendMfaPhoneCode()
                secondFactorType = .phoneCode
            case .totp:
                secondFactorType = .totp
            case .backupCode:
                secondFactorType = .backupCode
            default:
                errorMessage = "This verification method isn’t supported yet."
                return
            }
            code = ""
            step = .secondFactor
        }
    }

    private func resendSecondFactor() async {
        if case .emailCode? = secondFactorType { await selectSecondFactor(.emailCode) }
        else if case .phoneCode? = secondFactorType { await selectSecondFactor(.phoneCode) }
    }

    private func activate(_ sessionId: String?) async {
        guard let sessionId else {
            errorMessage = "The session could not be started. Please try again."
            return
        }
        await perform {
            try await clerk.auth.setActive(sessionId: sessionId)
            dismiss()
        }
    }

    private func perform(_ operation: () async throws -> Void) async {
        let wasWorking = isWorking
        isWorking = true
        errorMessage = nil
        defer { isWorking = wasWorking }
        do { try await operation() }
        catch { errorMessage = error.localizedDescription }
    }

    private func goBack() {
        if step == .secondFactorOptions { step = .secondFactor }
        else { dismiss() }
    }
}

private struct AuthInputStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 17))
            .padding(.horizontal, 15)
            .frame(height: 52)
            .background(ZineTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 13))
            .overlay {
                RoundedRectangle(cornerRadius: 13)
                    .strokeBorder(ZineTheme.border, lineWidth: 1)
            }
    }
}
