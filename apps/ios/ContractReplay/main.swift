import Foundation

guard CommandLine.arguments.count == 2 else {
    fatalError("usage: daily-feed-contract-replay <fixture.json>")
}

let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let response = try JSONDecoder().decode(DailyFeedResponse.self, from: data)

guard response.variant.id == "people-first-v2",
      response.inputs?.favorites != nil,
      response.sections != nil
else {
    fatalError("fixture did not contain the people-first-v2 contract")
}

print(
    "native-decode=ok variant=\(response.variant.id) posts=\(response.posts.count) conversations=\(response.conversations.count)"
)
