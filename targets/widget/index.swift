import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entries: [SimpleEntry] = [SimpleEntry(date: Date())]
        let timeline = Timeline(entries: entries, policy: .never)
        completion(timeline)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
}

struct WidgetEntryView : View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        // Deep link into the app to add a new note
        let addUrl = URL(string: "purenotes://add")!
        
        Group {
            switch family {
            case .accessoryCircular:
                Image(systemName: "square.and.pencil")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .padding(8)
                
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 20))
                    Text("New Note")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
            case .accessoryInline:
                Text("\(Image(systemName: "square.and.pencil")) New Note")
                
            default:
                // .systemSmall (Home Screen)
                VStack {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundColor(Color(red: 98/255, green: 0, blue: 238/255)) // #6200EE approx
                        .padding(.bottom, 2)
                    
                    Text("New Note")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.primary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .widgetURL(addUrl)
        // iOS 17+ requires containerBackground API
        .containerBackground(for: .widget) {
            if family == .systemSmall {
                Color(red: 240/255, green: 242/255, blue: 245/255) // #F0F2F5 approx
            } else {
                Color.clear
            }
        }
    }
}

@main
struct PureNotesWidget: Widget {
    let kind: String = "PureNotesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            WidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Quick Add")
        .description("Add a new note quickly.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
