import type { Message } from "@ds-bot/mobile-sdk";

export function chatTailVersion(messages: readonly Message[]) {
  const tail = messages[messages.length - 1];
  return tail ? JSON.stringify([tail.id, tail.text, tail.reasoning, tail.attachments, tail.tool, tail.systemEvent, tail.interrupted]) : "";
}

// The same controller drives native handlers and deterministic event-trace tests.
export function createChatScrollController(options: {
  scrollToEnd: (animated: boolean) => void;
  unreadChanged: (unread: boolean) => void;
  frame: (callback: () => void) => () => void;
  delay: (callback: () => void, milliseconds: number) => () => void;
}) {
  let tail = "";
  let positioned = false;
  let following = true;
  let nearBottom = true;
  let touching = false;
  let dragging = false;
  let settling = false;
  let momentum = false;
  let unread = false;
  let cancelFrame: (() => void) | undefined;
  let cancelSettle: (() => void) | undefined;
  const sizes = new Map<string, string>();
  const interacting = () => touching || dragging || settling || momentum;
  function setUnread(value: boolean) {
    if (value === unread) return;
    unread = value;
    options.unreadChanged(value);
  }
  function cancelFollow() { cancelFrame?.(); cancelFrame = undefined; }
  function follow(animated = false) {
    if (!tail || !following || interacting()) return;
    cancelFollow();
    cancelFrame = options.frame(() => {
      cancelFrame = undefined;
      // Recheck at execution: a drag can begin after this frame was queued.
      if (!following || interacting()) return;
      positioned = true;
      options.scrollToEnd(animated);
    });
  }
  function finishInteraction() {
    if (touching || dragging || momentum) return;
    settling = false;
    cancelSettle?.();
    cancelSettle = undefined;
    following = nearBottom;
    if (following) { setUnread(false); follow(); }
  }
  function settle() {
    cancelSettle?.();
    settling = true;
    cancelSettle = options.delay(finishInteraction, 160);
  }
  return {
    tailChanged(value: string) {
      if (value === tail) return;
      const hadTail = !!tail;
      tail = value;
      if (!tail) return;
      if (following && !interacting()) follow();
      else if (hadTail) setUnread(true);
    },
    resize(kind: "viewport" | "content", width: number, height: number) {
      const size = `${width}:${height}`;
      if (sizes.get(kind) === size) return;
      sizes.set(kind, size);
      follow();
    },
    initialPosition() { if (!positioned) follow(); },
    touchStart() { touching = true; positioned = true; cancelFollow(); },
    touchEnd() { touching = false; if (!dragging && !settling && !momentum) finishInteraction(); },
    beginDrag() {
      dragging = true;
      positioned = true;
      following = false;
      cancelFollow();
      cancelSettle?.();
    },
    endDrag() { dragging = false; settle(); },
    momentumStart() { momentum = true; cancelFollow(); cancelSettle?.(); },
    momentumEnd() { momentum = false; finishInteraction(); },
    scroll(offset: number, contentHeight: number, viewportHeight: number) {
      if (!positioned) return;
      nearBottom = contentHeight - offset - viewportHeight < 120;
      if (nearBottom) setUnread(false);
      // Geometry changes during automatic following must not detach the tail.
      if (!following && !interacting()) following = nearBottom;
      if (settling && !momentum) settle();
    },
    loadOlder() {
      positioned = true;
      following = false;
      nearBottom = false;
      cancelFollow();
    },
    sent() {
      if (interacting()) return;
      following = nearBottom = true;
      setUnread(false);
      follow();
    },
    jumpToBottom() {
      touching = dragging = settling = momentum = false;
      cancelSettle?.();
      following = nearBottom = true;
      setUnread(false);
      follow(true);
    },
    dispose() { cancelFollow(); cancelSettle?.(); },
  };
}
