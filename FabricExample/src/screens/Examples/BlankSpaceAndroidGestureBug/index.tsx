import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyboardChatScrollView,
  KeyboardController,
  KeyboardGestureArea,
  KeyboardProvider,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import Animated, { FadeIn, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Message = {
  id: string;
  text: string;
  sender: "user" | "system";
  timeStamp: number;
  isPlaceholder?: boolean;
  isNew?: boolean;
};

const createId = () => String(Date.now());

const INITIAL_AI_TEXT = "Hi.";

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
}: {
  text: string;
  isPlaceholder: boolean;
  timeStamp: number;
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
    <View
      style={[
        styles.messageContainer,
        styles.systemMessageContainer,
        styles.systemStyle,
      ]}
    >
      <Text style={styles.messageText}>{text}</Text>
      <View style={[styles.timeStamp, styles.systemStyle]}>
        <Text style={styles.timeStampText}>
          {new Date(timeStamp).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
};

const LIFT_BEHAVIORS = ["always", "whenAtEnd", "persistent", "never"] as const;

type LiftBehavior = (typeof LIFT_BEHAVIORS)[number];

const REPLIES = [
  (_msg: string) => "Ok.",
  (_msg: string) => "Sure.",
  (_msg: string) => "Yep.",
  (_msg: string) => "Noted.",
];

function pickReply(input: string, userMessage: string): string {
  const letter = input.trim().toLowerCase().charAt(0);
  const index = letter.charCodeAt(0) - "a".charCodeAt(0);

  if (index >= 0 && index < REPLIES.length) {
    return REPLIES[index](userMessage);
  }

  return REPLIES[Math.floor(Math.random() * REPLIES.length)](userMessage);
}

const AIKeyboardChatNoList = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [liftBehavior, setLiftBehavior] = useState<LiftBehavior>("whenAtEnd");
  const scrollRef = useRef<Animated.ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const composerRef = useRef<View>(null);
  const activeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const insets = useSafeAreaInsets();

  const extraContentPadding = useSharedValue(120);
  const blankSpace = useSharedValue(1000);

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

  const scrollToEnd = useCallback((animated: boolean) => {
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  const doSendMessage = (text: string, rawInput: string) => {
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

    requestAnimationFrame(() => {
      if (Platform.OS === "android") {
        // Android seems to need a small timeout
        schedule(() => scrollToEnd(true), 60);
      } else {
        scrollToEnd(true);
      }
      schedule(() => simulateAIResponse(text, rawInput), 800);
    });
  };

  const sendMessage = async () => {
    const text = inputText.trim();

    if (!text) {
      return;
    }

    const rawInput = inputText;

    setInputText("");

    // Note: could await for keyboard to be dismissed
    // but it's not necessary for this example
    KeyboardController.dismiss();

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

  const onComposerLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const height = event.nativeEvent.layout.height;
      if (Number.isFinite(height)) {
        extraContentPadding.value = height;
      }
    },
    [extraContentPadding],
  );

  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  return (
    <KeyboardProvider>
      <View style={styles.container}>
        <View style={styles.behaviorBar}>
          {LIFT_BEHAVIORS.map((b) => (
            <Text
              key={b}
              onPress={() => setLiftBehavior(b)}
              style={[
                styles.behaviorButton,
                b === liftBehavior && styles.behaviorButtonActive,
              ]}
            >
              {b}
            </Text>
          ))}
        </View>
        <KeyboardGestureArea
          interpolator="ios"
          offset={60}
          style={styles.container}
        >
          <KeyboardChatScrollView
            contentContainerStyle={styles.contentContainer}
            extraContentPadding={extraContentPadding}
            blankSpace={blankSpace}
            keyboardLiftBehavior={liftBehavior}
            offset={insets.bottom}
            ref={scrollRef}
            scrollIndicatorInsets={{ bottom: -insets.bottom }}
            style={styles.list}
          >
            {messages.map((item) => (
              <View key={item.id}>
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
                    isPlaceholder={!!item.isPlaceholder}
                    text={item.text}
                    timeStamp={item.timeStamp}
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
            onLayout={onComposerLayout}
            ref={composerRef}
            style={[
              styles.inputContainer,
              { paddingBottom: insets.bottom + 10 },
            ]}
          >
            <TextInput
              editable={!isStreaming}
              focusable={!isStreaming}
              multiline
              onChangeText={setInputText}
              placeholder="Type a message"
              ref={inputRef}
              style={styles.input}
              value={inputText}
            />
            <Button disabled={isStreaming} onPress={sendMessage} title="Send" />
          </View>
        </KeyboardStickyView>
      </View>
    </KeyboardProvider>
  );
};

const styles = StyleSheet.create({
  behaviorBar: {
    backgroundColor: "#ffffff",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 1000,
  },
  behaviorButton: {
    backgroundColor: "#ddd",
    borderRadius: 12,
    color: "#666",
    fontSize: 13,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  behaviorButtonActive: {
    backgroundColor: "#007AFF",
    color: "#fff",
  },
  composerWrapper: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  container: {
    backgroundColor: "#fff",
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  dot: {
    backgroundColor: "#007AFF",
    borderRadius: 4,
    height: 8,
    marginHorizontal: 2,
    width: 8,
  },
  input: {
    backgroundColor: "white",
    borderColor: "#ccc",
    borderRadius: 5,
    borderWidth: 1,
    color: "black",
    flex: 1,
    marginRight: 10,
    padding: 10,
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: "#ffffffa0",
    borderColor: "#ccc",
    borderTopWidth: 1,
    flexDirection: "row",
    padding: 10,
  },
  list: {
    flex: 1,
  },
  messageContainer: {
    borderRadius: 16,
    padding: 16,
  },
  messageText: {
    color: "black",
    fontSize: 16,
    lineHeight: 22,
  },
  placeholderContainer: {
    backgroundColor: "#f8f9fa",
    borderColor: "#e9ecef",
    borderWidth: 1,
  },
  placeholderText: {
    color: "#666",
    fontSize: 14,
    fontStyle: "italic",
  },
  systemMessageContainer: {},
  systemStyle: {
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  timeStamp: {},
  timeStampText: {
    color: "#888",
    fontSize: 12,
  },
  typingIndicator: {
    alignItems: "center",
    flexDirection: "row",
  },
  userMessageContainer: {
    backgroundColor: "#007AFF",
  },
  userMessageText: {
    color: "white",
  },
  userStyle: {
    alignItems: "flex-end",
    alignSelf: "flex-end",
    maxWidth: "75%",
  },
});

export default AIKeyboardChatNoList;
