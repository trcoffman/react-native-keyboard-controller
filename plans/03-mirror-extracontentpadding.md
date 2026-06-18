# Approach 03 — mirror `extraContentPadding` gating exactly (recommended first)

> See `00-diagnosis.md` for the shared mechanism and fix shape.

## Idea

`blankSpace` and `extraContentPadding` both feed the same `totalPadding`
(`KeyboardChatScrollView`: `max(blankSpace, keyboardPadding + extraContentPadding)`).
So treat a `blankSpace` change the **same way** the existing reaction treats an
`extraContentPadding` change — identical `effectiveDelta` computation, identical
`shouldShiftContent` / `isScrollAtEnd` / `persistent` / `never` / `inverted`
gating, identical `scrollToTarget`.

This is the principled fix: it removes the asymmetry where one input to
`totalPadding` gets a scroll correction and the other doesn't.

## Change

File: `src/components/KeyboardChatScrollView/useExtraContentPadding/index.ts`

Factor the body of the existing `extraContentPadding` reaction into a shared
worklet that takes `(prevPadding, currPadding)` for the changed source, then add
a second `useAnimatedReaction` on `blankSpace.value`. The shared worklet:

```ts
const applyPaddingChange = (
  prevSourceTotalInput: number,   // previous value of the source that changed
  currSourceTotalInput: number,   // current value of the source that changed
  otherInputs: { keyboardPadding: number; extra: number; blank: number; useBlankPrev: number; useBlankCurr: number },
) => {
  "worklet";
  // compute previousTotal / currentTotal via the SAME
  //   max(blank, keyboardPadding + extra)
  // formula, varying only the input that changed.
  ...
  const effectiveDelta = currentTotal - previousTotal;
  if (effectiveDelta === 0) return;            // absorbed by the floor

  const atEnd = isScrollAtEnd(scroll.value, layout.value.height, size.value.height, inverted);

  if (keyboardLiftBehavior === "persistent" && effectiveDelta < 0 && !atEnd) return;
  if (!shouldShiftContent(keyboardLiftBehavior, atEnd)) return;

  if (inverted) {
    const target = Math.max(scroll.value - effectiveDelta, -currentTotal);
    scrollToTarget(target);
  } else {
    const maxScroll = Math.max(size.value.height - layout.value.height + currentTotal, 0);
    const target = Math.min(scroll.value + effectiveDelta, maxScroll);
    scrollToTarget(target);
  }
};
```

Then:

```ts
// existing reaction — extraContentPadding changed
useAnimatedReaction(
  () => extraContentPadding.value,
  (current, previous) => {
    if (freeze.value || previous === null) return;
    // previousTotal = max(blank, kbd + previous); currentTotal = max(blank, kbd + current)
    applyPaddingChangeForExtra(previous, current);
  },
  [inverted, keyboardLiftBehavior],
);

// NEW reaction — blankSpace changed
useAnimatedReaction(
  () => blankSpace.value,
  (current, previous) => {
    if (freeze.value || previous === null) return;
    // previousTotal = max(previous, kbd + extra); currentTotal = max(current, kbd + extra)
    applyPaddingChangeForBlank(previous, current);
  },
  [inverted, keyboardLiftBehavior],
);
```

Key detail: `effectiveDelta` is computed on **`totalPadding`**, not on the raw
source. So if the `max()` floor means the changed source didn't actually move
`totalPadding` (e.g. keyboard already exceeds blankSpace), `effectiveDelta === 0`
and no correction fires — exactly the existing `extraContentPadding` semantics.
This automatically prevents double-correcting.

## Important interaction to verify
- When BOTH the keyboard handler (`useChatKeyboard` `onStart`) and this reaction
  could move the offset in the same frame, ensure they don't fight. The keyboard
  path sets `contentOffsetY` directly; this reaction also writes `contentOffsetY`.
  In the collapse scenario the keyboard isn't animating, so they shouldn't
  overlap — but confirm on device that opening/closing the keyboard while a
  collapse animates doesn't double-apply.

## Pros
- Consistent: both `totalPadding` inputs corrected identically.
- Handles `persistent` / `never` / `inverted` for free.
- `effectiveDelta`-on-total naturally no-ops when the floor absorbs the change.

## Cons
- Slightly more refactor than 01/02 (extract shared worklet).
- Two reactions writing `contentOffsetY` — must confirm no double-apply when
  both `blankSpace` and `extraContentPadding` change in the same commit (e.g.
  composer grows while a message collapses). Mitigation: the `effectiveDelta`
  on `totalPadding` makes each reaction compute against the *current* other
  input, but two reactions firing in one commit each read the same `scroll.value`
  — consider coalescing into a single reaction keyed on `totalPadding` if a
  double-apply shows up (see "Variant" below).

## Variant (if double-apply appears)
Instead of two reactions, add **one** `useAnimatedReaction` keyed on the derived
`totalPadding` (or recompute `max(blank, kbd+extra)` inside the reaction's
prepare fn). Then a change from *either* source produces exactly one correction
with the correct `effectiveDelta`. This is the cleanest end state and may be
worth going to directly.

## Verify
- Device: Collapse primary case → fixed, no shift.
- Device: Expand → no shift.
- Device: keyboard open/close with `blankSpace` set → unchanged (absorption
  still works; existing `blankSpace.ios.spec.ts` behavior preserved).
- Device: grow composer (extraContentPadding) while collapsing → single smooth
  correction, no double jump.
- Then unit tests mirroring the `extraContentPadding` specs for the new
  `blankSpace` reaction.
