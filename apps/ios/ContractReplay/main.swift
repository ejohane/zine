import Foundation

guard CommandLine.arguments.count == 2 else {
    fatalError("usage: daily-feed-contract-replay <fixture.json>")
}

let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let response = try JSONDecoder().decode(DailyFeedResponse.self, from: data)

guard response.schemaVersion == 2,
      response.variant.id == "people-first-v3",
      response.inputs?.favorites != nil,
      response.sections != nil,
      response.clustering?.method == "THREAD_FIRST_EVIDENCE_CLUSTERING",
      response.threadUnits?.isEmpty == false,
      response.topicClusters?.isEmpty == false
else {
    fatalError("fixture did not contain the people-first-v3 thread-first contract")
}

print(
    "native-decode=ok variant=\(response.variant.id) posts=\(response.posts.count) threads=\(response.threadUnits?.count ?? 0) topics=\(response.topicClusters?.count ?? 0)"
)
