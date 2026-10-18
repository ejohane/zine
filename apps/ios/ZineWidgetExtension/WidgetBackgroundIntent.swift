import AppIntents

struct WidgetBackgroundEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Background"
    static var defaultQuery = WidgetBackgroundQuery()
    let id: String
    let name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct WidgetBackgroundQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [WidgetBackgroundEntity] {
        let choices = options
        return identifiers.map { id in
            choices.first { $0.id == id } ?? WidgetBackgroundEntity(id: id, name: "Automatic")
        }
    }

    func suggestedEntities() async throws -> [WidgetBackgroundEntity] { options }
    func defaultResult() async -> WidgetBackgroundEntity? { options.first }

    private var options: [WidgetBackgroundEntity] {
        [WidgetBackgroundEntity(id: "clear", name: "Clear"),
         WidgetBackgroundEntity(id: "automatic", name: "Automatic")]
            + WidgetColorStorage().load().map { WidgetBackgroundEntity(id: $0.id, name: $0.name) }
    }
}

struct JumpBackInConfiguration: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Jump Back In"
    static var description = IntentDescription("Save custom colors in Zine → Settings → Appearance → Widget backgrounds, then choose one here.")

    @Parameter(title: "Background")
    var background: WidgetBackgroundEntity?

    static var parameterSummary: some ParameterSummary {
        Summary { \.$background }
    }
}
