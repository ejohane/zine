import Foundation
import Observation

@MainActor
@Observable
final class EditorialLabStore {
    private(set) var experiments: [EditorialExperiment] = []
    private(set) var selectedExperimentID: String?
    private(set) var selectedVariantID: String?
    private(set) var preference: EditorialExperimentPreference?
    private(set) var notes = ""
    private(set) var isLoading = false
    private(set) var isLoadingPreview = false
    private(set) var isSubmitting = false
    private(set) var errorMessage: String?
    private(set) var confirmationMessage: String?

    private let client: APIClient
    private var decisionEventID = UUID().uuidString

    init(client: APIClient) {
        self.client = client
    }

    var selectedExperiment: EditorialExperiment? {
        experiments.first { $0.id == selectedExperimentID }
    }

    var selectedVariant: EditorialExperimentVariant? {
        selectedExperiment?.variants.first { $0.id == selectedVariantID }
    }

    var readyExperimentCount: Int {
        experiments.filter { $0.status == .readyForReview }.count
    }

    var canSubmitDecision: Bool {
        selectedExperiment?.isReviewable == true && preference != nil && !isSubmitting
    }

    func load() async {
        isLoading = experiments.isEmpty
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await client.listEditorialExperiments()
            experiments = response.experiments
            restoreSelection()
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectExperiment(_ id: String) {
        guard id != selectedExperimentID else { return }
        selectedExperimentID = id
        restoreReviewDraft()
        selectDefaultVariant()
        confirmationMessage = nil
        errorMessage = nil
    }

    func selectVariant(_ id: String) {
        selectedVariantID = id
        errorMessage = nil
    }

    func setPreference(_ value: EditorialExperimentPreference?) {
        guard preference != value else { return }
        preference = value
        decisionEventID = UUID().uuidString
        confirmationMessage = nil
    }

    func setNotes(_ value: String) {
        guard notes != value else { return }
        notes = value
        decisionEventID = UUID().uuidString
        confirmationMessage = nil
    }

    func loadSelectedPreview() async -> EditorialExperimentPreviewResponse? {
        guard let experimentID = selectedExperimentID,
              let variantID = selectedVariantID
        else { return nil }
        isLoadingPreview = true
        errorMessage = nil
        defer { isLoadingPreview = false }
        do {
            return try await client.getEditorialExperimentPreview(
                experimentID: experimentID,
                variantID: variantID
            )
        } catch is CancellationError {
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func submitDecision() async -> EditorialExperimentDecisionResponse? {
        guard let experimentID = selectedExperimentID, let preference else { return nil }
        isSubmitting = true
        errorMessage = nil
        confirmationMessage = nil
        defer { isSubmitting = false }
        do {
            let response = try await client.submitEditorialExperimentDecision(
                experimentID: experimentID,
                preference: preference,
                notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
                clientEventID: decisionEventID
            )
            replace(response.experiment)
            confirmationMessage = preference == .neither
                ? "Decision saved. Nothing will be promoted."
                : "Choice \(preference.title) saved. Promotion still requires explicit approval."
            return response
        } catch is CancellationError {
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func dismissError() {
        errorMessage = nil
    }

    private func restoreSelection() {
        let retained = experiments.first { $0.id == selectedExperimentID }
        let preferred = retained
            ?? experiments.first { $0.status == .readyForReview }
            ?? experiments.first { $0.status == .decided }
            ?? experiments.first
        selectedExperimentID = preferred?.id
        restoreReviewDraft()
        selectDefaultVariant()
    }

    private func selectDefaultVariant() {
        guard let experiment = selectedExperiment else {
            selectedVariantID = nil
            return
        }
        if experiment.variants.contains(where: { $0.id == selectedVariantID }) { return }
        let reviewedLabel = experiment.latestReview?.preference.rawValue
        selectedVariantID = experiment.variants.first { $0.label.rawValue == reviewedLabel }?.id
            ?? experiment.variants.sorted { $0.label.rawValue < $1.label.rawValue }.first?.id
    }

    private func restoreReviewDraft() {
        preference = selectedExperiment?.latestReview?.preference
        notes = selectedExperiment?.latestReview?.notes ?? ""
        decisionEventID = UUID().uuidString
    }

    private func replace(_ experiment: EditorialExperiment) {
        if let index = experiments.firstIndex(where: { $0.id == experiment.id }) {
            experiments[index] = experiment
        } else {
            experiments.insert(experiment, at: 0)
        }
    }
}
