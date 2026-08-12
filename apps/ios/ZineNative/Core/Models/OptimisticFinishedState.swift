import Foundation

struct OptimisticFinishedState: Equatable {
    struct Mutation: Equatable {
        let previousIsFinished: Bool
        let previousFinishedAt: String?
        let requestedIsFinished: Bool
    }

    private(set) var isFinished: Bool
    private(set) var finishedAt: String?
    private(set) var isUpdating = false
    private(set) var hasLocalChange = false

    init(isFinished: Bool, finishedAt: String?) {
        self.isFinished = isFinished
        self.finishedAt = finishedAt
    }

    mutating func beginToggle(now: Date = Date()) -> Mutation? {
        guard !isUpdating else { return nil }

        let mutation = Mutation(
            previousIsFinished: isFinished,
            previousFinishedAt: finishedAt,
            requestedIsFinished: !isFinished
        )
        hasLocalChange = true
        isUpdating = true
        isFinished = mutation.requestedIsFinished
        finishedAt = mutation.requestedIsFinished ? now.formatted(.iso8601) : nil
        return mutation
    }

    mutating func accept(isFinished: Bool, finishedAt: String?) {
        self.isFinished = isFinished
        self.finishedAt = finishedAt
        isUpdating = false
        hasLocalChange = true
    }

    mutating func rollback(_ mutation: Mutation) {
        isFinished = mutation.previousIsFinished
        finishedAt = mutation.previousFinishedAt
        isUpdating = false
        hasLocalChange = true
    }

    mutating func hydrate(isFinished: Bool, finishedAt: String?) {
        guard !hasLocalChange else { return }
        self.isFinished = isFinished
        self.finishedAt = finishedAt
    }

    mutating func synchronize(
        isFinished: Bool,
        finishedAt: String?,
        isUpdating: Bool
    ) {
        self.isFinished = isFinished
        self.finishedAt = finishedAt
        self.isUpdating = isUpdating
        hasLocalChange = true
    }
}
