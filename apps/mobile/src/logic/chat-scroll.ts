import type { Message } from "@ds-bot/mobile-sdk";

export function chatTailVersion(messages: readonly Message[]) {
  const tail = messages[messages.length - 1];
  return tail ? JSON.stringify([tail.id, tail.text, tail.reasoning, tail.attachments, tail.tool, tail.systemEvent, tail.interrupted]) : "";
}

// The same controller drives native handlers and deterministic event-trace tests.
export function createChatScrollController(options: {
  scrollToEnd: (animated: boolean) => void;
  unreadChanged: (unread: boolean) => void;
  followingChanged?: (following: boolean) => void;
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
  let layoutFollowBudget = 0;
  let tailAwaitingFollow = false;
  let cancelFrame: (() => void) | undefined;
  let cancelSettle: (() => void) | undefined;
  const sizes = new Map<string, { width: number; height: number }>();
  const interacting = () => touching || dragging || settling || momentum;
  function setUnread(value: boolean) {
    if (value === unread) return;
    unread = value;
    options.unreadChanged(value);
  }
  function cancelFollow() { cancelFrame?.(); cancelFrame = undefined; }
  function setFollowing(value: boolean) {
    if (following === value) return;
    following = value;
    options.followingChanged?.(value);
  }
  function follow(animated = false, fromLayout = false) {
    if (!tail || !following || interacting()) return;
    if (fromLayout && layoutFollowBudget <= 0) return;
    cancelFollow();
    cancelFrame = options.frame(() => {
      cancelFrame = undefined;
      // Recheck at execution: a drag can begin after this frame was queued.
      if (!following || interacting()) return;
      if (fromLayout) {
        if (layoutFollowBudget <= 0) return;
        layoutFollowBudget--;
      }
      positioned = true;
      tailAwaitingFollow = false;
      options.scrollToEnd(animated);
    });
  }
  function finishInteraction() {
    if (touching || dragging || momentum) return;
    settling = false;
    cancelSettle?.();
    cancelSettle = undefined;
    setFollowing(nearBottom);
    if (following) {
      const catchUp = tailAwaitingFollow;
      setUnread(false);
      if (catchUp) follow();
    }
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
      tailAwaitingFollow = true;
      layoutFollowBudget = 2;
      if (following && !interacting()) follow();
      else if (hadTail) setUnread(true);
    },
    resize(kind: "viewport" | "content", width: number, height: number) {
      const previous = sizes.get(kind);
      if (previous && Math.abs(previous.width - width) <= 1 && Math.abs(previous.height - height) <= 1) return;
      sizes.set(kind, { width, height });
      // Virtualized rows can repeatedly revise the estimated content height.
      // Only a new tail, an explicit send/jump, or a viewport change grants
      // layout corrections. Content measurements cannot grant their own budget.
      if (kind === "viewport") layoutFollowBudget = 2;
      follow(false, true);
    },
    initialPosition() { if (!positioned) follow(); },
    touchStart() { touching = true; positioned = true; layoutFollowBudget = 0; cancelFollow(); },
    touchEnd() { touching = false; if (!dragging && !settling && !momentum) finishInteraction(); },
    beginDrag() {
      dragging = true;
      positioned = true;
      layoutFollowBudget = 0;
      setFollowing(false);
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
      if (!following && !interacting()) setFollowing(nearBottom);
      if (settling && !momentum) settle();
    },
    loadOlder() {
      positioned = true;
      layoutFollowBudget = 0;
      setFollowing(false);
      nearBottom = false;
      cancelFollow();
    },
    sent() {
      if (interacting()) return;
      nearBottom = true;
      setFollowing(true);
      layoutFollowBudget = 2;
      setUnread(false);
      follow();
    },
    jumpToBottom() {
      touching = dragging = settling = momentum = false;
      cancelSettle?.();
      nearBottom = true;
      setFollowing(true);
      layoutFollowBudget = 2;
      setUnread(false);
      follow(true);
    },
    dispose() { cancelFollow(); cancelSettle?.(); },
  };
}
