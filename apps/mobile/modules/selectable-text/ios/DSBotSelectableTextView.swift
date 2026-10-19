import ExpoModulesCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

// Observe contact with a new paragraph without recognizing or competing with
// UIKit's word-selection, handle-dragging, link or scrolling gestures.
private final class SelectionTouchObserver: UIGestureRecognizer {
  var onTouchBegan: (() -> Void)?

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    onTouchBegan?()
    state = .failed
  }

  override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool {
    false
  }

  override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool {
    false
  }
}

final class DSBotSelectableTextView: ExpoView, UITextViewDelegate {
  let onContentSizeChange = EventDispatcher()
  let onLink = EventDispatcher()

  var runs: [SelectableTextRun] = [] { didSet { needsTextUpdate = true } }
  var lineHeight: Double = 25 { didSet { needsTextUpdate = true } }
  var foregroundColor: UIColor = .label { didSet { needsTextUpdate = true } }
  var selectionColor: UIColor = .systemBlue {
    didSet { textView.tintColor = selectionColor }
  }
  var selectionIdentifier: String? {
    didSet { textView.accessibilityIdentifier = selectionIdentifier ?? accessibilityIdentifier }
  }
  var heading = false {
    didSet {
      if heading {
        textView.accessibilityTraits.insert(.header)
      } else {
        textView.accessibilityTraits.remove(.header)
      }
    }
  }

  private static weak var activeTextView: UITextView?
  private let textView = UITextView(frame: .zero, textContainer: nil)
  private var needsTextUpdate = true
  private var needsMeasurement = true
  private var updatingText = false
  private var measuredWidth: CGFloat = 0
  private var emittedHeight: CGFloat?
  private var pendingHeight: CGFloat?
  private var heightDeliveryScheduled = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // UIKit owns word selection, handles, the edit menu and copying. A read-only
    // UITextView can become the selection responder without showing a keyboard.
    textView.isEditable = false
    textView.isSelectable = true
    textView.isScrollEnabled = false
    textView.dataDetectorTypes = []
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    textView.contentInset = .zero
    textView.contentInsetAdjustmentBehavior = .never
    textView.backgroundColor = .clear
    textView.tintColor = selectionColor
    textView.linkTextAttributes = [:]
    textView.adjustsFontForContentSizeCategory = true
    textView.isAccessibilityElement = true
    textView.delegate = self
    let touchObserver = SelectionTouchObserver(target: nil, action: nil)
    touchObserver.cancelsTouchesInView = false
    touchObserver.delaysTouchesBegan = false
    touchObserver.delaysTouchesEnded = false
    touchObserver.onTouchBegan = { [weak self] in
      guard let self, let previous = Self.activeTextView, previous !== self.textView else { return }
      // A plain tap in a read-only UITextView need not create a nonempty new
      // selection, so the delegate alone cannot dismiss the previous paragraph.
      Self.clearActiveSelection()
    }
    // Observe at the Expo wrapper: UITextView owns and reconfigures its internal
    // gesture recognizers while presenting and dismissing selection interactions.
    // An ancestor still receives touches hit-tested to the UITextView subtree.
    addGestureRecognizer(touchObserver)
    // The UITextView is the only accessibility element; do not repeat its text
    // at the Expo wrapper as well.
    isAccessibilityElement = false
    addSubview(textView)
  }

  static func clearActiveSelection() {
    guard let active = activeTextView else { return }
    activeTextView = nil
    active.selectedRange = NSRange(location: 0, length: 0)
    active.resignFirstResponder()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      if Self.activeTextView === textView {
        Self.activeTextView = nil
      }
      textView.selectedRange = NSRange(location: 0, length: 0)
      textView.resignFirstResponder()
      pendingHeight = nil
    } else {
      needsMeasurement = true
      setNeedsLayout()
    }
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if previousTraitCollection?.preferredContentSizeCategory != traitCollection.preferredContentSizeCategory {
      needsTextUpdate = true
      updateTextIfNeeded()
    }
  }

  func updateTextIfNeeded() {
    guard needsTextUpdate else { return }
    needsTextUpdate = false
    let next = attributedContent()
    // Polling, selection and a parent's unrelated render must not assign the
    // same text again: doing so dismisses the native selection UI.
    guard textView.attributedText?.isEqual(to: next) != true else { return }

    let selected = textView.selectedRange
    let sameText = textView.text == next.string
    updatingText = true
    textView.textStorage.beginEditing()
    if sameText {
      // A theme/font update changes attributes without replacing characters.
      next.enumerateAttributes(in: NSRange(location: 0, length: next.length)) { attributes, range, _ in
        textView.textStorage.setAttributes(attributes, range: range)
      }
    } else {
      textView.textStorage.setAttributedString(next)
    }
    textView.textStorage.endEditing()
    if selected.location != NSNotFound {
      // NSRange and NSTextStorage use UTF-16, including for emoji and CJK text.
      let start = min(selected.location, next.length)
      let restored = NSRange(location: start, length: min(selected.length, next.length - start))
      if textView.selectedRange != restored {
        textView.selectedRange = restored
      }
    }
    updatingText = false
    needsMeasurement = true
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    textView.accessibilityIdentifier = selectionIdentifier ?? accessibilityIdentifier
    if textView.frame != bounds {
      textView.frame = bounds
    }
    let width = bounds.width
    guard width.isFinite, width > 0 else { return }
    let pixel = 1 / max(traitCollection.displayScale, 1)
    guard needsMeasurement || abs(width - measuredWidth) > pixel else { return }
    needsMeasurement = false
    measuredWidth = width
    let fitting = textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    guard fitting.height.isFinite else { return }
    let height = ceil(fitting.height / pixel) * pixel
    // Retain the newest value even if it returns to the last emitted size while
    // an older pending height is waiting for its delivery turn.
    pendingHeight = height
    guard !heightDeliveryScheduled else { return }
    guard emittedHeight == nil || abs(height - emittedHeight!) > pixel else { return }
    heightDeliveryScheduled = true
    // Deliver after the native layout pass, coalescing width/text changes. A
    // selection/menu change never invalidates measurement or emits a new size.
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.heightDeliveryScheduled = false
      guard self.window != nil, let latest = self.pendingHeight else { return }
      self.pendingHeight = nil
      guard self.emittedHeight == nil || abs(latest - self.emittedHeight!) > pixel else { return }
      self.emittedHeight = latest
      self.onContentSizeChange(["height": Double(latest)])
    }
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    guard !updatingText, textView.selectedRange.length > 0 else { return }
    if let previous = Self.activeTextView, previous !== textView {
      Self.activeTextView = nil
      previous.selectedRange = NSRange(location: 0, length: 0)
      previous.resignFirstResponder()
    }
    Self.activeTextView = textView
  }

  func textView(
    _ textView: UITextView,
    shouldInteractWith URL: URL,
    in characterRange: NSRange,
    interaction: UITextItemInteraction
  ) -> Bool {
    // Long-press previews/actions are not taps. Never let UIKit open a host URL;
    // the JS caller handles mentions and applies its existing link policy.
    if interaction == .invokeDefaultAction {
      onLink(["url": URL.absoluteString])
    }
    return false
  }

  private func attributedContent() -> NSAttributedString {
    let result = NSMutableAttributedString(string: "")
    let fonts = runs.map(fontForRun)
    let metrics = UIFontMetrics(forTextStyle: .body)
    let requestedLineHeight = CGFloat(lineHeight.isFinite && lineHeight > 0 ? lineHeight : 25)
    let scaledLineHeight = metrics.scaledValue(for: requestedLineHeight, compatibleWith: traitCollection)
    let paragraph = NSMutableParagraphStyle()
    paragraph.minimumLineHeight = max(scaledLineHeight, fonts.map(\.lineHeight).max() ?? 0)
    paragraph.maximumLineHeight = paragraph.minimumLineHeight
    paragraph.lineBreakMode = .byWordWrapping

    for (index, run) in runs.enumerated() {
      var attributes: [NSAttributedString.Key: Any] = [
        .font: fonts[index],
        .foregroundColor: run.color ?? foregroundColor,
        .paragraphStyle: paragraph
      ]
      if run.strikethrough {
        attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
      }
      if let background = run.backgroundColor {
        attributes[.backgroundColor] = background
      }
      if let value = run.url, !value.isEmpty, let url = URL(string: value) {
        attributes[.link] = url
        attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
      }
      result.append(NSAttributedString(string: run.text, attributes: attributes))
    }
    return result
  }

  private func fontForRun(_ run: SelectableTextRun) -> UIFont {
    let size = CGFloat(run.fontSize.isFinite && run.fontSize > 0 ? run.fontSize : 17)
    let weight = fontWeight(run.fontWeight)
    let family = run.fontFamily?.trimmingCharacters(in: .whitespacesAndNewlines)
    var font: UIFont
    if family?.lowercased() == "monospace" {
      font = .monospacedSystemFont(ofSize: size, weight: weight)
    } else if let family, !family.isEmpty, let custom = UIFont(name: family, size: size) {
      font = custom
      if run.fontWeight != nil {
        let descriptor = font.fontDescriptor.addingAttributes([
          .traits: [UIFontDescriptor.TraitKey.weight: weight.rawValue]
        ])
        font = UIFont(descriptor: descriptor, size: size)
      }
    } else {
      font = .systemFont(ofSize: size, weight: weight)
    }
    if run.italic,
       let descriptor = font.fontDescriptor.withSymbolicTraits(font.fontDescriptor.symbolicTraits.union(.traitItalic)) {
      font = UIFont(descriptor: descriptor, size: size)
    }
    return UIFontMetrics(forTextStyle: .body).scaledFont(for: font, compatibleWith: traitCollection)
  }

  private func fontWeight(_ value: String?) -> UIFont.Weight {
    switch value?.lowercased() {
    case "100", "ultralight": return .ultraLight
    case "200", "thin": return .thin
    case "300", "light": return .light
    case "500", "medium": return .medium
    case "600", "semibold": return .semibold
    case "700", "bold": return .bold
    case "800", "heavy": return .heavy
    case "900", "black": return .black
    default: return .regular
    }
  }
}
