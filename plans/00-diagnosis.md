# Diagnosis: collapse layout-shift in `blankSpace` (AI ScrollView Chat) — iOS

## Confirmed mechanism (data-backed)

The downward shift on **Collapse** is an **offset clamp on content shrink that
is never corrected when `blankSpace` grows.**

Sequence (non-inverted, iOS, `liftBehavior=whenAtEnd`, anchor = last user msg):

1. AI reply (below the anchor) shrinks by `Δ`. Content height drops by `Δ`.
2. iOS immediately clamps `contentOffset.y` down to the new
   `maxOffset = contentSize.height + contentInset.bottom − layoutHeight`.
   Because `contentInset.bottom` (= `blankSpace`) is still small, `maxOffset`
   drops by ~`Δ` → the offset drops → **content visually shifts down**, older
   content slides in from the top.
3. The row `onLayout` → `recalculateBlankSpace` grows `blankSpace` by ~`Δ`
   (floor `viewport − contentBelowAnchor` rises) → `contentInset.bottom` grows
   → `maxOffset` returns to where it was. **But nothing re-applies the offset**,
   so the anchor stays mid-screen.

## Two experiments that nail it

| Commit | `blankSpace` behavior on collapse | Inset change? | Result |
|---|---|---|---|
| `mp` (`experiment: static blankSpace`) | hardcoded `400`, `recalculate` short-circuited | none | ✅ anchor holds |
| `uwwm` (`don't let blankSpace grow`) | allowed to shrink, **grow blocked** | shrinks only | ❌ shifts down |

- `mp` works **because the inset was pre-oversized** → `maxOffset` never falls
  below the held offset on shrink → no clamp → anchor holds.
- `uwwm` breaks because the inset stays small **and** content still shrinks →
  clamp fires → no correction.

Conclusion: the shift correlates with **the inset NOT being large enough at the
moment content shrinks**, and the missing piece is a **scroll correction paired
with the `blankSpace` grow**, applied atomically so iOS never settles on the
clamped offset.

## Why this is a library gap (not an example bug)

- `blankSpace` is **read** all over the library (padding floor, absorption math)
  but there is **no `useAnimatedReaction` watching `blankSpace` itself**.
- The library already solves the *analogous* problem for `extraContentPadding`:
  `src/components/KeyboardChatScrollView/useExtraContentPadding/index.ts` has a
  `useAnimatedReaction(() => extraContentPadding.value, ...)` that adjusts scroll
  by the padding delta when it changes.
- `ScrollViewWithBottomPadding` already emits `contentInset` **and**
  `contentOffset` from the **same `useAnimatedProps` block**, so a paired
  correction can be atomic (single native commit) on Fabric iOS.

## The fix shape (common to all three approaches)

Add a `blankSpace`-change reaction (UI thread) in `useExtraContentPadding`
(it already receives `blankSpace`, `scroll`, `layout`, `size`, `contentOffsetY`,
`keyboardPadding`, `inverted`, `keyboardLiftBehavior`, `freeze`). When
`blankSpace` changes by `delta`:

```
non-inverted:
  maxScroll = max(size.height − layout.height + currentTotalPadding, 0)
  target    = min(scroll.value + delta, maxScroll)
  scrollToTarget(target)   // writes contentOffsetY on iOS/Fabric (atomic w/ inset)
```

Rationale for `+delta`: when the inset grows by `delta` the content the user is
looking at must move *up* by `delta` to stay pinned, which on a non-inverted
list means scrolling **down** (increasing offset) by `delta`. This is the same
sign convention `useExtraContentPadding` uses for `effectiveDelta`.

`scrollToTarget` already exists in `useExtraContentPadding` and on iOS/Fabric
sets `contentOffsetY.value = target` (atomic with the inset via shared
`animatedProps`); on Android it defers a `scrollTo` to the next frame.

The three approaches differ **only in the gating** of when the correction runs.

## Approaches

- `01-only-when-at-end.md` — correct only when at/near content end (targeted).
- `02-always-on-grow.md` — correct on every `blankSpace` change (simplest).
- `03-mirror-extracontentpadding.md` — reuse the exact gating that
  `extraContentPadding` already uses (most consistent).

## Recommendation

Start with **03 (mirror `extraContentPadding`)**. It is the lowest-risk,
highest-consistency option: `blankSpace` and `extraContentPadding` both feed the
same `totalPadding`, so making them share identical correction + gating logic is
the principled fix and is least likely to introduce a new asymmetry bug. It also
naturally handles `persistent`/`never`/inverted, which 01 and 02 punt on.

If 03 over-corrects in some scroll positions on device, fall back to **01**
(narrow it to the at-end/anchored case). **02** is mainly a diagnostic — use it
only to confirm the correction direction/magnitude is right before adding gating.

## Test / verify

- Device-first (iPhone 17 sim, `FabricExample`): repro per
  `HANDOFF-collapse-blankspace.md` steps; Collapse must land directly on the
  "desired" state with no visible shift. Then re-check Expand.
- Only after device works: add/adjust unit tests under
  `src/components/KeyboardChatScrollView/useExtraContentPadding/__tests__/`
  (and `useChatKeyboard/__tests__/blankSpace.ios.spec.ts` if behavior there
  changes).
- iOS first, then port/verify Android.
