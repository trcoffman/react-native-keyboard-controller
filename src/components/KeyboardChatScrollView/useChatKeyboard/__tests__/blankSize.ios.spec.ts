import {
  type Handlers,
  KEYBOARD,
  createRender,
  mockLayout,
  mockOffset,
  mockSize,
  setupBeforeEach,
  sv,
} from "../__fixtures__/testUtils";

const render = createRender("../index.ios");

let handlers: Handlers = {
  onStart: jest.fn(),
  onMove: jest.fn(),
  onInteractive: jest.fn(),
  onEnd: jest.fn(),
};

jest.mock("../../../../hooks", () => ({
  useKeyboardHandler: jest.fn((h: Handlers) => {
    handlers = h;
  }),
  useResizeMode: jest.fn(),
}));

jest.mock("../../../hooks/useScrollState", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    offset: mockOffset,
    layout: mockLayout,
    size: mockSize,
  })),
}));

beforeEach(() => {
  setupBeforeEach();
});

describe("blankSize — iOS non-inverted + always", () => {
  it("blankSize=0 produces identical behavior to default", () => {
    mockOffset.value = 100;
    const { result } = render({
      inverted: false,
      keyboardLiftBehavior: "always",
      blankSize: sv(0),
    });

    handlers.onStart({ height: KEYBOARD });

    expect(result.current.padding.value).toBe(KEYBOARD);
    expect(result.current.contentOffsetY!.value).toBe(400);
  });

  it("full absorption: preserves current scroll position when blankSize > keyboard", () => {
    mockOffset.value = 100;
    const { result } = render({
      inverted: false,
      keyboardLiftBehavior: "always",
      blankSize: sv(500),
    });

    handlers.onStart({ height: KEYBOARD });

    expect(result.current.padding.value).toBe(KEYBOARD);
    // scrollEff = 0 → contentOffsetY = scroll.value (no shift)
    expect(result.current.contentOffsetY!.value).toBe(100);
  });

  it("partial absorption: reduced content offset displacement", () => {
    mockOffset.value = 100;
    const { result } = render({
      inverted: false,
      keyboardLiftBehavior: "always",
      blankSize: sv(100),
    });

    handlers.onStart({ height: KEYBOARD });

    expect(result.current.padding.value).toBe(KEYBOARD);
    // blankAbsorbed=100, scrollEff=200, actualTotalPadding=max(100,300+0)=300
    // relativeScroll = 100 - 0 = 100 (no previous padding)
    // contentOffsetY = computeIOSContentOffset(100, 200, 2000, 800, false, 300)
    //   maxScroll = max(2000 - 800 + 300, 0) = 1500
    //   target = min(max(200 + 100, 0), 1500) = 300
    expect(result.current.contentOffsetY!.value).toBe(300);
  });
});

describe("blankSize — iOS inverted + always", () => {
  it("full absorption: preserves current scroll position (inverted)", () => {
    mockOffset.value = 0;
    const { result } = render({
      inverted: true,
      keyboardLiftBehavior: "always",
      blankSize: sv(500),
    });

    handlers.onStart({ height: KEYBOARD });

    expect(result.current.padding.value).toBe(KEYBOARD);
    // scrollEff = 0 → contentOffsetY = scroll.value
    expect(result.current.contentOffsetY!.value).toBe(0);
  });

  it("partial absorption: reduced content offset displacement (inverted)", () => {
    mockOffset.value = 0;
    const { result } = render({
      inverted: true,
      keyboardLiftBehavior: "always",
      blankSize: sv(100),
    });

    handlers.onStart({ height: KEYBOARD });

    expect(result.current.padding.value).toBe(KEYBOARD);
    // blankAbsorbed=100, scrollEff=200, actualTotalPadding=max(100,300+0)=300
    // relativeScroll = 0 + 0 = 0 (no previous padding)
    // contentOffsetY = computeIOSContentOffset(0, 200, 2000, 800, true, 300)
    //   maxScroll = max(2000 - 800, 0) = 1200
    //   result = max(min(0-200, 1200), -300) = max(-200, -300) = -200
    expect(result.current.contentOffsetY!.value).toBe(-200);
  });
});

describe("blankSize — iOS persistent behavior", () => {
  it("full absorption on close: uses actualTotalPadding for snap", () => {
    mockOffset.value = 100;
    const { result } = render({
      inverted: false,
      keyboardLiftBehavior: "persistent",
      blankSize: sv(500),
    });

    // Open keyboard — fully absorbed, position preserved
    handlers.onStart({ height: KEYBOARD });
    expect(result.current.contentOffsetY!.value).toBe(100);

    // Close keyboard — persistent + shrinking
    mockOffset.value = 100;
    handlers.onStart({ height: 0 });

    expect(result.current.padding.value).toBe(0);
    // atEnd check: 100 + 800 = 900 < 2000 - 20 = 1980 → not at end
    // → contentOffsetY = scroll.value = 100
    expect(result.current.contentOffsetY!.value).toBe(100);
  });
});

describe("blankSize — iOS never behavior", () => {
  it("full absorption on close: uses actualTotalPadding when at end", () => {
    mockOffset.value = 100;
    const { result } = render({
      inverted: false,
      keyboardLiftBehavior: "never",
      blankSize: sv(500),
    });

    // Open keyboard
    handlers.onStart({ height: KEYBOARD });
    expect(result.current.contentOffsetY!.value).toBe(100);

    // Close keyboard — user scrolled to end
    // end with blankSize: contentHeight - layoutHeight + totalPadding
    // totalPadding on close = max(500, 0+0) = 500
    // maxScroll = 2000 - 800 + 500 = 1700
    mockOffset.value = 1700;
    handlers.onStart({ height: 0 });

    expect(result.current.padding.value).toBe(0);
    // atEnd: 1700 + 800 = 2500 >= 2000 - 20 = 1980 → at end
    // actualTotalPadding = max(500, 0+0) = 500
    // contentOffsetY = max(2000-800+500, 0) = 1700
    expect(result.current.contentOffsetY!.value).toBe(1700);
  });
});

describe("blankSize — iOS whenAtEnd behavior", () => {
  it("full absorption prevents shift even when at end", () => {
    mockOffset.value = 1180;
    const { result } = render({
      inverted: false,
      keyboardLiftBehavior: "whenAtEnd",
      blankSize: sv(500),
    });

    handlers.onStart({ height: KEYBOARD });

    expect(result.current.padding.value).toBe(KEYBOARD);
    // blankAbsorbed=500, scrollEff=0 → contentOffsetY = scroll.value
    expect(result.current.contentOffsetY!.value).toBe(1180);
  });
});
