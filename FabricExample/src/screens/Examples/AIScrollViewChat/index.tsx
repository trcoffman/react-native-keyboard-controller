import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardChatScrollView,
  KeyboardController,
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import Animated, { FadeIn, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import styles from "./styles";

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

const AIResponse = ({
  text,
  isPlaceholder,
  timeStamp,
  expanded,
  onToggle,
}: {
  text: string;
  isPlaceholder: boolean;
  timeStamp: number;
  expanded: boolean;
  onToggle: () => void;
}) => {
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
      <Text numberOfLines={expanded ? undefined : 6} style={styles.messageText}>
        {text}
      </Text>
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
  // Index of the message that should be anchored to the top of the viewport
  // after a user send — same semantics as anchorToTopIndex in the LegendList example.
  const [anchorToTopIndex, setAnchorToTopIndex] = useState<number | undefined>(
    undefined,
  );
  const scrollRef =
    useRef<React.ComponentRef<typeof KeyboardChatScrollView>>(null);
  const inputRef = useRef<TextInput>(null);
  const composerRef = useRef<View>(null);
  const activeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const insets = useSafeAreaInsets();

  // Heights measured via onLayout for each message, keyed by message id.
  const messageSizes = useRef<Map<string, number>>(new Map());
  // Viewport height of the scroll view itself.
  const scrollViewHeight = useRef<number>(0);

  const composerHeight = useSharedValue(100);
  const blankSpace = useSharedValue(0);

  const onComposerLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      composerHeight.value = event.nativeEvent.layout.height;
    },
    [],
  );

  // Recompute blankSpace whenever sizes or the anchor index change.
  // blankSpace = max(0, scrollViewHeight - sum of heights from anchorToTopIndex onwards)
  const recalculateBlankSpace = useCallback(
    (msgs: Message[], anchor: number | undefined) => {
      if (anchor === undefined || anchor < 0) {
        blankSpace.value = 0;

        return;
      }

      let contentBelowAnchor = 0;

      for (let i = anchor; i < msgs.length; i++) {
        const h = messageSizes.current.get(msgs[i].id) ?? 0;

        contentBelowAnchor += h;
      }

      blankSpace.value = Math.max(
        0,
        scrollViewHeight.current - contentBelowAnchor,
      );
    },
    [],
  );

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

  // When a message is about to COLLAPSE (expanded → collapsed) the content below
  // the anchor shrinks. Until `recalculateBlankSpace` grows blankSpace, iOS
  // clamps the scroll offset to the smaller content, shifting the anchor down.
  // Reserve a full viewport of blankSpace *now*, before the numberOfLines change
  // commits, so the inset is already large when the content shrinks → iOS never
  // clamps → the anchor stays put. recalculateBlankSpace then settles it to the
  // precise value once the collapsed row is measured. Must be called
  // synchronously before the state update that collapses the row (both manual
  // taps and the 5s auto-recollapse).
  const reserveForCollapse = useCallback(() => {
    blankSpace.value = scrollViewHeight.current;
  }, []);

  // Clear a message's expand/collapse override so it follows the current
  // default again. When the default is contracted, clearing an expanded
  // override re-collapses the row, so reserve the inset first (same flash fix).
  const resetOverride = useCallback(
    (id: string) => {
      setOverrides((prev) => {
        if (!prev.has(id)) {
          return prev;
        }

        // Read the live state from `prev` (not a captured closure — this runs
        // from a 5s timer where captured `overrides` would be stale): clearing
        // an expanded override while the default is contracted re-collapses the
        // row, so reserve the inset first (same flash fix as toggleMessage).
        const wasExpanded = prev.get(id) ?? defaultExpanded;

        if (wasExpanded && !defaultExpanded) {
          reserveForCollapse();
        }

        const next = new Map(prev);

        next.delete(id);

        return next;
      });
    },
    [defaultExpanded, reserveForCollapse],
  );

  const toggleMessage = useCallback(
    (id: string) => {
      const isExpanded = overrides.has(id)
        ? overrides.get(id)!
        : defaultExpanded;

      if (isExpanded) {
        reserveForCollapse();
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
    [defaultExpanded, overrides, reserveForCollapse, resetOverride, schedule],
  );

  const toggleDefaultMode = useCallback(() => {
    // Switching the default resets per-message overrides so everything follows
    // the new default uniformly.
    setDefaultExpanded((prev) => !prev);
    setOverrides(new Map());
  }, []);

  const doSendMessage = (text: string, rawInput: string) => {
    const newAnchor = messages.length;

    setAnchorToTopIndex(newAnchor);

    setMessages((prevMessages) => {
      const next = [
        ...prevMessages,
        {
          id: createId(),
          isNew: true,
          sender: "user" as const,
          text,
          timeStamp: Date.now(),
        },
      ];

      // Recompute with the new message list and anchor synchronously so
      // blankSpace is set before the next render.
      recalculateBlankSpace(next, newAnchor);

      return next;
    });

    schedule(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
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

  // Re-run blankSpace calculation whenever messages or anchor changes.
  useEffect(() => {
    recalculateBlankSpace(messages, anchorToTopIndex);
  }, [messages, anchorToTopIndex, recalculateBlankSpace]);

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
      </View>
      <KeyboardGestureArea
        interpolator="ios"
        offset={60}
        style={styles.container}
      >
        <KeyboardChatScrollView
          ref={scrollRef}
          applyWorkaroundForContentInsetHitTestBug
          blankSpace={blankSpace}
          contentContainerStyle={styles.contentContainer}
          extraContentPadding={composerHeight}
          keyboardDismissMode="interactive"
          keyboardLiftBehavior={liftBehavior}
          maintainVisibleContentPosition={
            Platform.OS === "android" ? undefined : { minIndexForVisible: 0 }
          }
          offset={insets.bottom}
          scrollIndicatorInsets={{ bottom: -insets.bottom }}
          style={styles.list}
          onLayout={(e) => {
            scrollViewHeight.current = e.nativeEvent.layout.height;
            recalculateBlankSpace(messages, anchorToTopIndex);
          }}
        >
          {messages.map((item) => (
            <View
              key={item.id}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                const prev = messageSizes.current.get(item.id) ?? 0;

                if (h !== prev) {
                  messageSizes.current.set(item.id, h);
                  recalculateBlankSpace(messages, anchorToTopIndex);
                }
              }}
            >
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
                  expanded={overrides.get(item.id) ?? defaultExpanded}
                  isPlaceholder={!!item.isPlaceholder}
                  text={item.text}
                  timeStamp={item.timeStamp}
                  onToggle={() => toggleMessage(item.id)}
                />
              )}
            </View>
          ))}
        </KeyboardChatScrollView>
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
