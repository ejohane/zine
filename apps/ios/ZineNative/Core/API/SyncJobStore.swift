import Foundation
import Observation

struct NativeSyncStart: Codable {
    let jobId: String
    let total: Int
    let existing: Bool
}

struct NativeSyncActive: Codable {
    let inProgress: Bool
    let jobId: String?
}

struct NativeSyncStatus: Codable {
    struct Failure: Codable {
        let subscriptionId: String
        let error: String
    }
    let jobId: String
    let status: String
    let total: Int
    let completed: Int
    let succeeded: Int
    let failed: Int
    let itemsFound: Int
    let progress: Double
    let errors: [Failure]

    var hasFailures: Bool { failed > 0 || !errors.isEmpty }
}

@MainActor
@Observable
final class SyncJobStore {
    private let client: APIClient
    private(set) var jobID: String?
    private(set) var status: NativeSyncStatus?
    private(set) var existing = false

    init(client: APIClient) { self.client = client }

    func start() async throws {
        let started = try await client.startSyncJob()
        jobID = started.jobId
        existing = started.existing
        status = nil
        try await refresh(id: started.jobId)
    }

    func active() async throws {
        let active = try await client.activeSyncJob()
        existing = false
        jobID = active.jobId
        status = nil
        if let id = active.jobId { try await refresh(id: id) }
    }

    func refresh(id: String? = nil) async throws {
        guard let id = id ?? jobID, !id.isEmpty else { throw CommandError("sync_job_id_required") }
        if jobID != id { status = nil }
        jobID = id
        let latest = try await client.syncJob(id: id)
        guard latest.jobId == id else { throw CommandError("sync_job_identity_mismatch") }
        jobID = id
        status = latest
    }

    func wait(
        id: String? = nil, timeout: Double = 40, interval: Duration = .seconds(1), onProgress: () -> Void
    ) async throws {
        guard timeout.isFinite, (0...40).contains(timeout) else {
            throw CommandError("timeout_must_be_between_zero_and_40")
        }
        let deadline = ContinuousClock.now.advanced(by: .seconds(timeout))
        repeat {
            try await refresh(id: id)
            onProgress()
            if status?.status == "completed" { return }
            guard ["pending", "processing"].contains(status?.status ?? "") else {
                throw CommandError("sync_unknown_status")
            }
            guard ContinuousClock.now < deadline else {
                throw CommandError("sync_wait_timed_out_job_continues")
            }
            try await Task.sleep(for: interval)
        } while true
    }
}
