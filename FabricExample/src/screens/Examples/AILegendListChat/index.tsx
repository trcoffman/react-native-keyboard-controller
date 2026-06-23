import {
  KeyboardAwareLegendList,
  useKeyboardChatComposerInset,
} from "@legendapp/list/keyboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardController,
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import styles from "./styles";

import type { LegendListRef } from "@legendapp/list/react-native";
import type { KeyboardChatScrollViewHandle } from "react-native-keyboard-controller";

type Message = {
  id: string;
  text: string;
  sender: "user" | "system";
  timeStamp: number;
  isPlaceholder?: boolean;
  isNew?: boolean;
};

const createId = () => String(Date.now());

const INITIAL_AI_TEXT =
  "Tip: Type 'a' for a short reply, 'b' for medium, 'c' for long, or 'd' for extra long. Any other text picks a random length.";

const INITIAL_MESSAGES: Message[] = [
  {
    id: "initial-user",
    sender: "user",
    text: "Hey, can you help me understand how React Native virtualization works?",
    timeStamp: Date.now(),
  },
  {
    id: "initial-ai",
    sender: "system",
    text: INITIAL_AI_TEXT,
    timeStamp: Date.now(),
  },
];

const COLLAPSED_LINE_COUNT = 6;
const LINE_HEIGHT = 22;
const COLLAPSED_HEIGHT = COLLAPSED_LINE_COUNT * LINE_HEIGHT;
const ANIMATION_DURATION = 250;

const AIResponse = ({
  text,
  isPlaceholder,
  timeStamp,
  expanded,
  animationsEnabled,
  onToggle,
  onCollapseAnimationEnd,
}: {
  text: string;
  isPlaceholder: boolean;
  timeStamp: number;
  expanded: boolean;
  animationsEnabled: boolean;
  onToggle: () => void;
  onCollapseAnimationEnd: () => void;
}) => {
  const fullHeight = useSharedValue<number | null>(null);
  const animatedHeight = useSharedValue<number>(COLLAPSED_HEIGHT);
  const isFirstLayout = useRef(true);

  // Keep the latest callback / flag in refs so the height-animation effect below
  // does NOT depend on them. The parent passes a fresh inline arrow every render
  // (and re-renders on every streaming word), so depending on them directly
  // would re-run the effect — and re-fire the timing animation — on each word.
  const onCollapseAnimationEndRef = useRef(onCollapseAnimationEnd);
  const animationsEnabledRef = useRef(animationsEnabled);

  onCollapseAnimationEndRef.current = onCollapseAnimationEnd;
  animationsEnabledRef.current = animationsEnabled;

  const animatedStyle = useAnimatedStyle(() => {
    if (animatedHeight.value === 0) {
      return {};
    }

    return { height: animatedHeight.value, overflow: "hidden" };
  });

  useEffect(() => {
    if (fullHeight.value === null) {
      return;
    }

    const target = expanded ? fullHeight.value : COLLAPSED_HEIGHT;

    if (isFirstLayout.current) {
      // eslint-disable-next-line react-compiler/react-compiler
      animatedHeight.value = target;
      isFirstLayout.current = false;
    } else if (expanded) {
      animatedHeight.value = animationsEnabledRef.current
        ? withTiming(target, { duration: ANIMATION_DURATION })
        : target;
    } else if (!animationsEnabledRef.current) {
      // Animations off: snap instantly. Defer the completion callback to the
      // next frame so the snapped (collapsed) height has committed and the list
      // has settled its layout before the reserved blankSpace is released —
      // releasing in the same frame drops the inset mid-collapse and shifts.
      animatedHeight.value = target;
      requestAnimationFrame(() => {
        onCollapseAnimationEndRef.current();
      });
    } else {
      // Collapsing: the content shrinks over ANIMATION_DURATION. The parent has
      // reserved blankSpace to keep the anchor pinned across the whole shrink;
      // release it only once the animation finishes (not when blankSpace first
      // changes mid-animation), so the reserved inset spans every frame.
      animatedHeight.value = withTiming(
        target,
        { duration: ANIMATION_DURATION },
        (finished) => {
          if (finished) {
            runOnJS(onCollapseAnimationEndRef.current)();
          }
        },
      );
    }
  }, [expanded, fullHeight, animatedHeight]);

  if (isPlaceholder) {
    return (
      <View
        style={[
          styles.messageContainer,
          styles.systemMessageContainer,
          styles.systemStyle,
        ]}
      >
        <View style={[styles.placeholderContainer, styles.messageContainer]}>
          <View style={styles.typingIndicator}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <Text style={styles.placeholderText}>AI is thinking...</Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      style={[
        styles.messageContainer,
        styles.systemMessageContainer,
        styles.systemStyle,
      ]}
      onPress={onToggle}
    >
      {/* Invisible full-text view used only to measure the unconstrained height */}
      <View
        pointerEvents="none"
        style={styles.measureLayer}
        onLayout={(e) => {
          const measured = e.nativeEvent.layout.height;

          if (measured === fullHeight.value) {
            return;
          }

          fullHeight.value = measured;

          // While expanded (e.g. streaming in word-by-word) the height must only
          // ever GROW — a transient smaller measurement must never shrink the
          // view, or the content below shifts up. Clamp the expanded target to
          // at least the current height. Only an explicit collapse
          // (`!expanded`, handled in the effect below) may shrink it.
          const target = expanded
            ? Math.max(measured, animatedHeight.value)
            : Math.min(measured, COLLAPSED_HEIGHT);

          animatedHeight.value =
            isFirstLayout.current || !animationsEnabledRef.current
              ? target
              : withTiming(target, { duration: ANIMATION_DURATION });
          isFirstLayout.current = false;
        }}
      >
        <Text style={styles.messageText}>{text}</Text>
      </View>
      <Animated.View style={animatedStyle}>
        <Text style={styles.messageText}>{text}</Text>
      </Animated.View>
      <View style={[styles.timeStamp, styles.systemStyle]}>
        <Text style={styles.timeStampText}>
          {new Date(timeStamp).toLocaleTimeString()}
        </Text>
      </View>
      <Text style={styles.expandToggle}>
        {expanded ? "▲ Collapse" : "▼ Expand"}
      </Text>
    </Pressable>
  );
};

const LIFT_BEHAVIORS = ["always", "whenAtEnd", "persistent", "never"] as const;

type LiftBehavior = (typeof LIFT_BEHAVIORS)[number];

const REPLIES = [
  (msg: string) => `Got it! "${msg}" - let me know if you need more help.`,
  (msg: string) =>
    `I understand you said: "${msg}". That's a great point! Here are a few thoughts:\n\n1. First consideration\n2. Second aspect\n\nAnything else? First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.`,
  (msg: string) =>
    `I understand you said: "${msg}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know?`,
  (msg: string) =>
    `I understand you said: "${msg}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know? I understand you said: "${msg}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know? I understand you said: "${msg}". This is a simulated AI response that demonstrates the streaming text functionality.\n\nLet me provide you with more details:\n\n1. First point about your question - this is important to consider when thinking about the broader context of your inquiry.\n\n2. Second important consideration - there are multiple angles to approach this from, and each has its own merits.\n\n3. Third aspect to keep in mind - don't forget about the practical implications and how they might affect your decision.\n\n4. Fourth element worth exploring - sometimes the less obvious factors turn out to be the most significant.\n\nIn conclusion, I hope this helps clarify things. Is there anything else you'd like to know?`,
];

function pickReply(input: string, userMessage: string): string {
  const letter = input.trim().toLowerCase().charAt(0);
  const index = letter.charCodeAt(0) - "a".charCodeAt(0);

  if (index >= 0 && index < REPLIES.length) {
    return REPLIES[index](userMessage);
  }

  return REPLIES[Math.floor(Math.random() * REPLIES.length)](userMessage);
}

const AIChat = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  // Whether messages are expanded by default (toggled by the button above the
  // list). Per-message taps override this default in `overrides`.
  const [defaultExpanded, setDefaultExpanded] = useState(true);
  // Per-message expand/collapse overrides keyed by message id: true = expanded,
  // false = collapsed. Absent = follow `defaultExpanded`.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [liftBehavior, setLiftBehavior] = useState<LiftBehavior>("whenAtEnd");
  // Whether expand/collapse height changes animate. When off, they snap.
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  // Index of the message that should be anchored to the top of the viewport
  // after a user send. KeyboardAwareLegendList renders trailing blank space
  // below this item so it can sit at the top when content underflows.
  const [anchorIndex, setAnchorIndex] = useState<number | undefined>(undefined);
  const listRef = useRef<LegendListRef>(null);
  // KeyboardAwareLegendList renders a KeyboardChatScrollView internally; this
  // ref reaches it so we can reserve/release blankSpace around a collapse.
  const scrollRef = useRef<KeyboardChatScrollViewHandle>(null);
  const inputRef = useRef<TextInput>(null);
  const composerRef = useRef<View>(null);
  const activeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const insets = useSafeAreaInsets();

  // Measures the composer and reports its height to the list as the end content
  // inset, replacing the manual composerHeight / reportContentInset wiring.
  const { contentInsetEndAdjustment, onComposerLayout } =
    useKeyboardChatComposerInset(listRef, composerRef, 100);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);

    activeTimers.current.push(id);

    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    activeTimers.current.forEach(clearTimeout);
    activeTimers.current = [];
    setIsStreaming(false);
  }, []);

  // Clear a message's expand/collapse override so it follows the current
  // default again. When the default is contracted, clearing an expanded
  // override re-collapses the row, so reserve the inset first (see the
  // `reserveBlankSpace` call in `toggleMessage` for why).
  const resetOverride = useCallback(
    (id: string) => {
      setOverrides((prev) => {
        if (!prev.has(id)) {
          return prev;
        }

        // Read the live state from `prev` (not a captured closure — this runs
        // from a 5s timer where captured `overrides` would be stale): clearing
        // an expanded override while the default is contracted re-collapses the
        // row, so reserve the inset before it shrinks.
        const wasExpanded = prev.get(id) ?? defaultExpanded;

        if (wasExpanded && !defaultExpanded) {
          scrollRef.current?.reserveBlankSpace();
        }

        const next = new Map(prev);

        next.delete(id);

        return next;
      });
    },
    [defaultExpanded],
  );

  const toggleMessage = useCallback(
    (id: string) => {
      const isExpanded = overrides.has(id)
        ? overrides.get(id)!
        : defaultExpanded;

      // Collapsing shrinks the content below the tapped message. Reserve a
      // generous inset *before* the shrink animation starts so the ScrollView
      // doesn't clamp the scroll offset (which would shift content) before the
      // list settles its layout.
      if (isExpanded) {
        scrollRef.current?.reserveBlankSpace();
      }

      setOverrides((prev) => {
        const next = new Map(prev);

        next.set(id, !isExpanded);

        // In default-contracted mode, an expand is temporary: re-contract it
        // after 5s so the list returns to its compact state on its own.
        if (!defaultExpanded && !isExpanded) {
          schedule(() => resetOverride(id), 5000);
        }

        return next;
      });
    },
    [defaultExpanded, overrides, resetOverride, schedule],
  );

  const toggleDefaultMode = useCallback(() => {
    // Switching the default resets per-message overrides so everything follows
    // the new default uniformly.
    setDefaultExpanded((prev) => !prev);
    setOverrides(new Map());
  }, []);

  // LegendList recycles rows and only re-renders them when `data` or `extraData`
  // changes. Expand/collapse lives in `defaultExpanded`/`overrides` (not in the
  // message data), so feed them through `extraData` to force affected rows to
  // re-render with the new expanded state.
  const expandState = useMemo(
    () => ({ animationsEnabled, defaultExpanded, overrides }),
    [animationsEnabled, defaultExpanded, overrides],
  );

  const doSendMessage = (text: string, rawInput: string) => {
    setAnchorIndex(messages.length);

    setMessages((prevMessages) => [
      ...prevMessages,
      {
        id: createId(),
        isNew: true,
        sender: "user",
        text: text,
        timeStamp: Date.now(),
      },
    ]);

    schedule(() => {
      listRef.current?.scrollToEnd({ animated: true });
      schedule(() => simulateAIResponse(text, rawInput), 800);
    }, 200);
  };

  const sendMessage = async () => {
    const text = inputText.trim();

    if (!text) {
      return;
    }

    const rawInput = inputText;

    setInputText("");

    await KeyboardController.dismiss();
    doSendMessage(text, rawInput);
  };

  const simulateAIResponse = (userMessage: string, rawInput: string) => {
    const aiMessageId = createId();
    const responseText = pickReply(rawInput, userMessage);
    const words = responseText.split(" ");
    let currentWordIndex = 1;

    setMessages((prevMessages) => [
      ...prevMessages,
      {
        id: aiMessageId,
        sender: "system",
        text: words[0],
        timeStamp: Date.now(),
      },
    ]);

    setIsStreaming(true);

    const intervalId = setInterval(() => {
      currentWordIndex++;

      if (currentWordIndex <= words.length) {
        const currentText = words.slice(0, currentWordIndex).join(" ");

        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === aiMessageId ? { ...msg, text: currentText } : msg,
          ),
        );
      } else {
        clearInterval(intervalId);
        setIsStreaming(false);
      }
    }, 16);

    activeTimers.current.push(intervalId);
  };

  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  return (
    <View style={styles.container}>
      <View style={styles.behaviorBar}>
        {LIFT_BEHAVIORS.map((b) => (
          <Text
            key={b}
            style={[
              styles.behaviorButton,
              b === liftBehavior && styles.behaviorButtonActive,
            ]}
            onPress={() => setLiftBehavior(b)}
          >
            {b}
          </Text>
        ))}
      </View>
      <View style={styles.behaviorBar}>
        <Text
          style={[styles.behaviorButton, styles.behaviorButtonActive]}
          onPress={toggleDefaultMode}
        >
          {defaultExpanded ? "Default: expanded" : "Default: contracted (5s)"}
        </Text>
        <Text
          style={[
            styles.behaviorButton,
            animationsEnabled && styles.behaviorButtonActive,
          ]}
          onPress={() => setAnimationsEnabled((prev) => !prev)}
        >
          {animationsEnabled ? "Animations: on" : "Animations: off"}
        </Text>
      </View>
      <KeyboardGestureArea
        interpolator="ios"
        offset={60}
        style={styles.container}
      >
        <KeyboardAwareLegendList
          ref={listRef}
          applyWorkaroundForContentInsetHitTestBug
          initialScrollAtEnd
          maintainVisibleContentPosition
          anchoredEndSpace={
            anchorIndex === undefined ? undefined : { anchorIndex }
          }
          // KeyboardAwareLegendList renders a KeyboardChatScrollView internally,
          // so this ref resolves to a KeyboardChatScrollViewHandle (with
          // reserve/releaseBlankSpace). The prop is typed for a plain ScrollView,
          // hence the cast.
          contentContainerStyle={styles.contentContainer}
          contentInsetEndAdjustment={contentInsetEndAdjustment}
          data={messages}
          extraData={expandState}
          keyboardLiftBehavior={liftBehavior}
          keyboardOffset={insets.bottom}
          keyExtractor={(_item, index) => `item-${index}`}
          maintainScrollAtEnd={Platform.OS === "web"}
          refScrollView={scrollRef as React.Ref<never>}
          renderItem={({ item }) => (
            <View>
              {item.sender === "user" ? (
                <Animated.View
                  entering={item.isNew ? FadeIn.duration(1000) : undefined}
                  style={[
                    styles.messageContainer,
                    styles.userMessageContainer,
                    styles.userStyle,
                  ]}
                >
                  <Text style={[styles.messageText, styles.userMessageText]}>
                    {item.text}
                  </Text>
                  <View style={[styles.timeStamp, styles.userStyle]}>
                    <Text style={styles.timeStampText}>
                      {new Date(item.timeStamp).toLocaleTimeString()}
                    </Text>
                  </View>
                </Animated.View>
              ) : (
                <AIResponse
                  animationsEnabled={animationsEnabled}
                  expanded={overrides.get(item.id) ?? defaultExpanded}
                  isPlaceholder={!!item.isPlaceholder}
                  text={item.text}
                  timeStamp={item.timeStamp}
                  onCollapseAnimationEnd={() => {
                    // Release the reserve once the collapse animation finishes.
                    requestAnimationFrame(() => {
                      scrollRef.current?.releaseBlankSpace();
                    });
                  }}
                  onToggle={() => toggleMessage(item.id)}
                />
              )}
            </View>
          )}
          scrollIndicatorInsets={{ bottom: -insets.bottom }}
          style={styles.list}
        />
      </KeyboardGestureArea>
      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={styles.composerWrapper}
      >
        <View
          ref={composerRef}
          style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}
          onLayout={onComposerLayout}
        >
          <TextInput
            ref={inputRef}
            multiline
            editable={!isStreaming}
            focusable={!isStreaming}
            placeholder="Type a message"
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
          />
          <Button disabled={isStreaming} title="Send" onPress={sendMessage} />
        </View>
      </KeyboardStickyView>
    </View>
  );
};

export default AIChat;
