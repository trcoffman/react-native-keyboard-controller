# Approach 01 — correct offset only when at/near end (anchored)

> See `00-diagnosis.md` for the shared mechanism and fix shape.

## Idea

Add a `useAnimatedReaction` on `blankSpace.value` in `useExtraContentPadding`.
Apply the paired scroll correction **only when the scroll position is at/near
the content end** (`isScrollAtEnd`). When the user has scrolled up to read older
messages, do nothing — don't yank the viewport.

This is the most *targeted* fix: the bug only manifests in the anchored
("pinned to top via blankSpace") state, which is precisely the at-end state.

## Change

File: `src/components/KeyboardChatScrollView/useExtraContentPadding/index.ts`

Add (alongside the existing `extraContentPadding` reaction):

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

    const atEnd = isScrollAtEnd(
      scroll.value,
      layout.value.height,
      size.value.height,
      inverted,
    );
    if (!atEnd) {
      return; // only correct in the anchored / at-end state
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
  [inverted, keyboardLiftBehavior],
);
```

Notes:
- Reuse the existing `scrollToTarget` worklet (already writes `contentOffsetY`
  on iOS/Fabric atomically with the inset; defers `scrollTo` on Android).
- Only fire when `delta !== 0` to avoid no-op churn.
- `currentTotal` uses the *new* blankSpace (`current`) so `maxScroll` reflects
  the grown inset → the corrected `target` is actually reachable in the same
  commit.

## Pros
- Narrow blast radius: never moves the view while the user reads history.
- Matches the feature's intent (anchor lives at the end).

## Cons
- Uses `isScrollAtEnd` with the *pre-change* `size`/`scroll`; right at the
  threshold (`AT_END_THRESHOLD = 20`) it could occasionally mis-gate during a
  shrink that also moves `size`. Verify on device for borderline cases.
- Diverges from `extraContentPadding` gating (which honors
  `shouldShiftContent`/`persistent`/`never`). Slight behavioral asymmetry
  between the two padding sources.

## Verify
- Device: Collapse from full-screen expanded reply → no shift (primary case).
- Device: scroll up into history, then trigger a `blankSpace` change → viewport
  must NOT jump.
- Re-check Expand and the `whenAtEnd` vs `always` behaviors.
