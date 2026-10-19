import ExpoModulesCore
import UIKit

struct SelectableTextRun: Record {
  @Field var text: String = ""
  @Field var color: UIColor?
  @Field var fontSize: Double = 17
  @Field var fontWeight: String?
  @Field var italic: Bool = false
  @Field var strikethrough: Bool = false
  @Field var fontFamily: String?
  @Field var backgroundColor: UIColor?
  @Field var url: String?
}

public final class DSBotSelectableTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DSBotSelectableText")

    AsyncFunction("clearSelection") {
      DSBotSelectableTextView.clearActiveSelection()
    }.runOnQueue(.main)

    View(DSBotSelectableTextView.self) {
      Events("onContentSizeChange", "onLink")

      Prop("runs") { (view, runs: [SelectableTextRun]) in
        view.runs = runs
      }
      Prop("lineHeight") { (view, value: Double) in
        view.lineHeight = value
      }
      Prop("textColor") { (view, color: UIColor) in
        view.foregroundColor = color
      }
      Prop("selectionColor") { (view, color: UIColor) in
        view.selectionColor = color
      }
      Prop("selectionIdentifier") { (view, value: String?) in
        view.selectionIdentifier = value
      }
      Prop("heading") { (view, value: Bool) in
        view.heading = value
      }

      OnViewDidUpdateProps { (view: DSBotSelectableTextView) in
        view.updateTextIfNeeded()
      }
    }
  }
}
