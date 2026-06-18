import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
} from "react";
import { StyleSheet } from "react-native";
import {
  makeMutable,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import Reanimated from "react-native-reanimated";

import ScrollViewWithBottomPadding from "../ScrollViewWithBottomPadding";

import { useChatKeyboard } from "./useChatKeyboard";
import { useEndVisible } from "./useEndVisible";
import { useExtraContentPadding } from "./useExtraContentPadding";

import type {
  KeyboardChatScrollViewHandle,
  KeyboardChatScrollViewProps,
} from "./types";
import type { LayoutChangeEvent } from "react-native";

const ZERO_CONTENT_PADDING = makeMutable(0);
const ZERO_BLANK_SPACE = makeMutable(0);

const KeyboardChatScrollView = forwardRef<
  KeyboardChatScrollViewHandle,
  React.PropsWithChildren<KeyboardChatScrollViewProps>
>(
  (
    {
      children,
      ScrollViewComponent = Reanimated.ScrollView,
      inverted = false,
      keyboardLiftBehavior = "always",
      freeze = false,
      offset = 0,
      extraContentPadding = ZERO_CONTENT_PADDING,
      blankSpace = ZERO_BLANK_SPACE,
      applyWorkaroundForContentInsetHitTestBug = false,
      onLayout: onLayoutProp,
      onContentSizeChange: onContentSizeChangeProp,
      onEndVisible,
      ...rest
    },
    ref,
  ) => {
    const scrollViewRef = useAnimatedRef<Reanimated.ScrollView>();
    const freezeSV = useDerivedValue(() =>
      typeof freeze === "boolean" ? freeze : freeze.value,
    );
    const {
      padding,
      currentHeight,
      contentOffsetY,
      scroll,
      layout,
      size,
      onLayout: onLayoutInternal,
      onContentSizeChange: onContentSizeChangeInternal,
    } = useChatKeyboard(scrollViewRef, {
      inverted,
      keyboardLiftBehavior,
      freeze: freezeSV,
      offset,
      blankSpace,
      extraContentPadding,
    });

    useExtraContentPadding({
      scrollViewRef,
      extraContentPadding,
      keyboardPadding: padding,
      blankSpace,
      scroll,
      layout,
      size,
      contentOffsetY,
      inverted,
      keyboardLiftBehavior,
      freeze: freezeSV,
    });

    useEndVisible({
      scroll,
      layout,
      size,
      inverted,
      onEndVisible,
    });

    // Transient inset reserve set imperatively via `ref.reserveBlankSpace()`
    // right before the consumer shrinks content (e.g. collapsing a message).
    // Until the consumer's `blankSpace` grows to absorb the shrink, the native
    // ScrollView would clamp the scroll offset to the now-smaller content and
    // the anchored item would shift. Reserving a generous bottom inset *before*
    // the shrink commits keeps the offset valid so nothing moves; the reserve
    // then decays as soon as `blankSpace` next updates (the consumer has
    // settled it to the precise value). See `reserveBlankSpace` below.
    const reserve = useSharedValue(0);

    // intentionally clamp `blankSpace` at one ScrollView viewport. The Android
    // `ClippingScrollView` workaround temporarily substitutes padding/range
    // during touch handling, and oversized blank ranges can de-sync during fast
    // momentum gestures. One viewport is enough for the short-content case;
    // larger values only allow scrolling to a fully blank screen which is not
    // the use case for this library. If you found this comment and it causes
    // a bug for you, please open an issue.
    const totalPadding = useDerivedValue(() =>
      Math.min(
        layout.value.height,
        Math.max(
          blankSpace.value,
          reserve.value,
          padding.value + extraContentPadding.value,
        ),
      ),
    );

    // Scroll indicator inset = keyboard + extraContentPadding (excludes blankSpace).
    // Apps that render into the unsafe area can supply a negative
    // scrollIndicatorInsets adjustment at the application layer.
    const indicatorPadding = useDerivedValue(
      () => padding.value + extraContentPadding.value,
    );

    const onLayout = useCallback(
      (e: LayoutChangeEvent) => {
        onLayoutInternal(e);
        onLayoutProp?.(e);
      },
      [onLayoutInternal, onLayoutProp],
    );

    const onContentSizeChange = useCallback(
      (w: number, h: number) => {
        onContentSizeChangeInternal(w, h);
        onContentSizeChangeProp?.(w, h);
      },
      [onContentSizeChangeInternal, onContentSizeChangeProp],
    );

    // Expose `reserveBlankSpace` / `releaseBlankSpace` alongside the underlying
    // ScrollView's own methods (e.g. `scrollTo`, `scrollToEnd`). The ScrollView
    // methods are delegated lazily to the live instance — `scrollViewRef.current`
    // is not populated until after mount, so we must read it at call time, not
    // when the handle is created.
    useImperativeHandle(
      ref,
      () =>
        new Proxy({} as KeyboardChatScrollViewHandle, {
          get(_target, prop) {
            if (prop === "reserveBlankSpace") {
              return (value?: number) => {
                // Reserve a generous bottom inset *now* (synchronously, before
                // the caller's content-shrink commit) so the native ScrollView
                // never clamps the offset while the content shrinks. The reserve
                // is held until `releaseBlankSpace()` is called — so it spans an
                // animated shrink, not just a single frame. Defaults to one
                // viewport — the most the inset is ever clamped to anyway.
                // eslint-disable-next-line react-compiler/react-compiler
                reserve.value = value ?? layout.value.height;
              };
            }

            if (prop === "releaseBlankSpace") {
              return () => {
                // Release the reserve once the shrink (and any animation) has
                // finished and the consumer's own `blankSpace` reflects the new
                // content size. The precise inset then takes over.
                reserve.value = 0;
              };
            }

            const instance = scrollViewRef.current as
              | (Reanimated.ScrollView & Record<PropertyKey, unknown>)
              | null;
            const member = instance?.[prop];

            return typeof member === "function"
              ? member.bind(instance)
              : member;
          },
        }),
      [scrollViewRef, reserve, layout],
    );

    // Invisible view whose animated style changes every frame during keyboard
    // animation. On Fabric, this forces Reanimated to schedule a commit,
    // which flushes the scrollTo call in the same frame (fixing de-synchronization).
    // see https://github.com/software-mansion/react-native-reanimated/issues/9000
    const commitStyle = useAnimatedStyle(
      () => ({
        transform: [{ translateY: -currentHeight.value }],
      }),
      [],
    );
    const commit = useMemo(
      () => [styles.commitView, commitStyle],
      [commitStyle],
    );

    return (
      <>
        <ScrollViewWithBottomPadding
          ref={scrollViewRef}
          {...rest}
          applyWorkaroundForContentInsetHitTestBug={
            applyWorkaroundForContentInsetHitTestBug
          }
          bottomPadding={totalPadding}
          contentOffsetY={contentOffsetY}
          inverted={inverted}
          scrollIndicatorPadding={indicatorPadding}
          ScrollViewComponent={ScrollViewComponent}
          onContentSizeChange={onContentSizeChange}
          onLayout={onLayout}
        >
          {children}
        </ScrollViewWithBottomPadding>
        <Reanimated.View style={commit} />
      </>
    );
  },
);

const styles = StyleSheet.create({
  commitView: {
    display: "none",
    position: "absolute",
  },
});

export default KeyboardChatScrollView;
