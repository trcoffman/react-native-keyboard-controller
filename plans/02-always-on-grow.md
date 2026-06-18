# Approach 02 — always correct on blankSpace change (simplest)

> See `00-diagnosis.md` for the shared mechanism and fix shape.

## Idea

Add a `useAnimatedReaction` on `blankSpace.value` that applies the paired scroll
correction **on every change**, regardless of scroll position. No `isScrollAtEnd`
gate.

Primarily a **diagnostic / proof-of-direction** step: it's the minimal code that
confirms the correction sign and magnitude are right. If it fully fixes Collapse
*and* doesn't visibly misbehave when scrolled up, it can stand on its own.

## Change

File: `src/components/KeyboardChatScrollView/useExtraContentPadding/index.ts`

```ts
useAnimatedReaction(
  () => blankSpace.value,
  (current, previous) => {
    if (freeze.value || previous === null) {
      return;
    }

    const delta = current - previous;
    if (delta === 0) {
      return;
    }

    const currentTotal = Math.max(
      current,
      keyboardPadding.value + extraContentPadding.value,
    );

    if (inverted) {
      const target = Math.max(scroll.value - delta, -currentTotal);
      scrollToTarget(target);
    } else {
      const maxScroll = Math.max(
        size.value.height - layout.value.height + currentTotal,
        0,
      );
      const target = Math.min(scroll.value + delta, maxScroll);
      scrollToTarget(target);
    }
  },
  [inverted],
);
```

## Pros
- Smallest, easiest to reason about. Good first probe to validate the
  `+delta` direction and that `scrollToTarget` lands atomically.

## Cons
- Will also move the viewport when `blankSpace` changes while the user is
  scrolled up reading history (e.g. an off-screen message re-measures, or the
  anchor index changes). Likely produces unwanted jumps in those cases.
- Ignores `keyboardLiftBehavior` entirely — inconsistent with the rest of the
  component's behavior model.

## Verify
- Device: Collapse primary case → must be fixed.
- Device: deliberately scroll up, then cause a `blankSpace` recompute (send a
  message, toggle default mode) → watch for unwanted jumps. If jumps appear,
  this approach is rejected in favor of 01 or 03.
