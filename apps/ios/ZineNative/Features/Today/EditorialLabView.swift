import SwiftUI

struct EditorialLabView: View {
    let store: EditorialLabStore
    let onPreview: (EditorialExperimentPreviewResponse) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if store.isLoading && store.experiments.isEmpty {
                    ProgressView("Loading experiments…")
                } else if let experiment = store.selectedExperiment {
                    experimentContent(experiment)
                } else {
                    ContentUnavailableView {
                        Label("No editorial experiments", systemImage: "flask")
                    } description: {
                        Text("Ask Codex to create and lock an experiment. It will appear here when variants are ready.")
                    } actions: {
                        Button("Check again") { Task { await store.load() } }
                    }
                }
            }
            .navigationTitle("Editorial Lab")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await store.load() }
    }

    private func experimentContent(_ experiment: EditorialExperiment) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                experimentPicker(experiment)
                experimentBrief(experiment)
                variants(experiment)
                if experiment.isReviewable {
                    review(experiment)
                }
                nextAction(experiment)
            }
            .padding(20)
        }
        .refreshable { await store.load() }
    }

    @ViewBuilder
    private func experimentPicker(_ experiment: EditorialExperiment) -> some View {
        if store.experiments.count > 1 {
            Menu {
                ForEach(store.experiments) { option in
                    Button {
                        store.selectExperiment(option.id)
                    } label: {
                        if option.id == experiment.id {
                            Label(option.title, systemImage: "checkmark")
                        } else {
                            Text(option.title)
                        }
                    }
                }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("EXPERIMENT")
                            .font(.caption2.weight(.bold))
                            .tracking(1)
                            .foregroundStyle(.secondary)
                        Text(experiment.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                    }
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .foregroundStyle(.secondary)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
        }
    }

    private func experimentBrief(_ experiment: EditorialExperiment) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(experiment.title)
                    .font(.system(size: 29, weight: .bold, design: .serif))
                Spacer(minLength: 12)
                Text(experiment.status.title.uppercased())
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(experiment.status == .readyForReview ? Color.accentColor : .secondary)
            }

            LabBriefItem(title: "Hypothesis", text: experiment.hypothesis)
            LabBriefItem(title: "Change", text: experiment.changeSummary)
            LabBulletList(title: "What success looks like", items: experiment.desiredOutcomes)
            if !experiment.guardrails.isEmpty {
                LabBulletList(title: "Guardrails", items: experiment.guardrails)
            }
        }
    }

    private func variants(_ experiment: EditorialExperiment) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Compare on Today")
                .font(.title3.bold())

            ForEach(experiment.variants.sorted { $0.label.rawValue < $1.label.rawValue }) { variant in
                Button {
                    store.selectVariant(variant.id)
                } label: {
                    HStack(alignment: .top, spacing: 14) {
                        Text(variant.label.rawValue)
                            .font(.headline.monospaced())
                            .frame(width: 34, height: 34)
                            .background(
                                store.selectedVariantID == variant.id
                                    ? Color.accentColor
                                    : Color.secondary.opacity(0.12),
                                in: Circle()
                            )
                            .foregroundStyle(store.selectedVariantID == variant.id ? .white : .primary)

                        VStack(alignment: .leading, spacing: 5) {
                            Text(variant.name)
                                .font(.headline)
                                .foregroundStyle(.primary)
                            Text(variant.description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Text(variant.headline)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                            Text("Quality \(variant.qualityScore, specifier: "%.1f")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        if store.selectedVariantID == variant.id {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    .padding(16)
                    .background(Color.secondary.opacity(0.07), in: .rect(cornerRadius: 18))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(
                                store.selectedVariantID == variant.id
                                    ? Color.accentColor.opacity(0.7)
                                    : .clear,
                                lineWidth: 1.5
                            )
                    }
                }
                .buttonStyle(.plain)
            }

            Button {
                Task {
                    guard let preview = await store.loadSelectedPreview() else { return }
                    onPreview(preview)
                    dismiss()
                }
            } label: {
                HStack {
                    if store.isLoadingPreview {
                        ProgressView()
                    } else {
                        Image(systemName: "newspaper")
                    }
                    Text("View Variant \(store.selectedVariant?.label.rawValue ?? "") on Today")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(store.selectedVariant == nil || store.isLoadingPreview)
        }
    }

    private func review(_ experiment: EditorialExperiment) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider()
            Text("Record your decision")
                .font(.title3.bold())
            Text("This saves your judgment. It never publishes a winner automatically.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                ForEach(EditorialExperimentPreference.allCases) { option in
                    Button(option.title) {
                        store.setPreference(option)
                    }
                    .buttonStyle(.bordered)
                    .tint(store.preference == option ? Color.accentColor : .secondary)
                    .fontWeight(store.preference == option ? .semibold : .regular)
                    .frame(maxWidth: .infinity)
                }
            }

            Text("Notes")
                .font(.subheadline.weight(.semibold))
            TextEditor(text: Binding(
                get: { store.notes },
                set: store.setNotes
            ))
            .frame(minHeight: 110)
            .padding(10)
            .background(Color.secondary.opacity(0.07), in: .rect(cornerRadius: 14))
            .accessibilityLabel("Experiment decision notes")

            Button {
                Task { _ = await store.submitDecision() }
            } label: {
                HStack {
                    if store.isSubmitting { ProgressView() }
                    Text(experiment.latestReview == nil ? "Save Decision" : "Update Decision")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!store.canSubmitDecision)

            if let message = store.confirmationMessage {
                Label(message, systemImage: "checkmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.green)
            }
            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
    }

    private func nextAction(_ experiment: EditorialExperiment) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("NEXT")
                .font(.caption2.bold())
                .tracking(1)
                .foregroundStyle(.secondary)
            Text(experiment.nextAction)
                .font(.subheadline)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.07), in: .rect(cornerRadius: 16))
    }
}

private struct LabBriefItem: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2.bold())
                .tracking(1)
                .foregroundStyle(.secondary)
            Text(text)
                .font(.body)
        }
    }
}

private struct LabBulletList: View {
    let title: String
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title.uppercased())
                .font(.caption2.bold())
                .tracking(1)
                .foregroundStyle(.secondary)
            ForEach(items, id: \.self) { item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("•")
                    Text(item)
                }
                .font(.body)
            }
        }
    }
}
