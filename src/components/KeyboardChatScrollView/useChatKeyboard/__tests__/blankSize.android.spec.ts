import {
  type Handlers,
  KEYBOARD,
  createRender,
  mockLayout,
  mockOffset,
  mockScrollTo,
  mockSize,
  setupBeforeEach,
  sv,
} from "../__fixtures__/testUtils";

const render = createRender("../index.ts");

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

describe("blankSize — Android non-inverted + always", () => {
  it("blankSize=0 produces identical behavior to default", () => {
    mockOffset.value = 100;
    render({
      inverted: false,
      keyboardLiftBehavior: "always",
      blankSize: sv(0),
    });

    handlers.onStart({ height: KEYBOARD });
    handlers.onMove({ height: 200 });
    expect(mockScrollTo).toHaveBeenCalledWith(expect.anything(), 0, 300, false);
  });

  it("full absorption: no scroll movement when blankSize > keyboard", () => {
    mockOffset.value = 100;
    render({
      inverted: false,
      keyboardLiftBehavior: "always",
      blankSize: sv(500),
    });

    handlers.onStart({ height: KEYBOARD });

    // scrollEff = max(0, 300 - 500) = 0 → sentinel set, no scrollTo
    handlers.onMove({ height: KEYBOARD });
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("partial absorption: reduced scroll displacement", () => {
    mockOffset.value = 100;
    render({
      inverted: false,
      keyboardLiftBehavior: "always",
      blankSize: sv(100),
    });

    handlers.onStart({ height: KEYBOARD });
    // blankAbsorbed = 100, scrollEff = max(0, 200-100) = 100
    // actualTotalPadding = max(100, 200+0) = 200
    // target = clampedScrollTarget(100, 100, 2000, 800, 200)
    //        = min(max(100+100, 0), max(2000-800+200, 0))
    //        = min(200, 1400) = 200
    handlers.onMove({ height: 200 });
    expect(mockScrollTo).toHaveBeenCalledWith(expect.anything(), 0, 200, false);
  });

  it("full absorption with extraContentPadding: blank absorbed = blankSize - extraContentPadding", () => {
    mockOffset.value = 100;
    const ecp = sv(50);
    render({
      inverted: false,
      keyboardLiftBehavior: "always",
      blankSize: sv(500),
      extraContentPadding: ecp,
    });

    handlers.onStart({ height: KEYBOARD });
    // blankAbsorbed = max(0, 500 - 50) = 450
    // scrollEff = max(0, 300 - 450) = 0 → sentinel → no scroll
    handlers.onMove({ height: KEYBOARD });
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
});

describe("blankSize — Android inverted + always", () => {
  it("full absorption: no scroll movement when blankSize > keyboard", () => {
    render({
      inverted: true,
      keyboardLiftBehavior: "always",
      blankSize: sv(500),
    });

    handlers.onStart({ height: KEYBOARD });
    handlers.onMove({ height: KEYBOARD });
    // blankAbsorbed=500, scrollEff=0 → guard triggers → no scrollTo
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("partial absorption: reduced scroll displacement (inverted)", () => {
    render({
      inverted: true,
      keyboardLiftBehavior: "always",
      blankSize: sv(100),
    });

    handlers.onStart({ height: KEYBOARD });
    // blankAbsorbed=100, scrollEff=max(0,200-100)=100
    // target = offsetBefore(0) + padding(300) - scrollEff(100) = 200
    handlers.onMove({ height: 200 });
    expect(mockScrollTo).toHaveBeenCalledWith(expect.anything(), 0, 200, false);
  });
});

describe("blankSize — Android never behavior", () => {
  it("full absorption: no scroll on close (non-inverted)", () => {
    mockOffset.value = 100;
    render({
      inverted: false,
      keyboardLiftBehavior: "never",
      blankSize: sv(500),
    });

    // Open keyboard
    handlers.onStart({ height: KEYBOARD });
    handlers.onMove({ height: KEYBOARD });
    mockScrollTo.mockClear();

    // Close keyboard
    handlers.onStart({ height: 0 });
    // scrollEff = 0, blankAbsorbed = 500 → skip
    handlers.onMove({ height: 150 });
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it("full absorption: no scroll on close (inverted)", () => {
    render({
      inverted: true,
      keyboardLiftBehavior: "never",
      blankSize: sv(500),
    });

    handlers.onStart({ height: KEYBOARD });
    handlers.onMove({ height: KEYBOARD });
    mockScrollTo.mockClear();

    handlers.onStart({ height: 0 });
    // effective=150, blankAbsorbed=500, scrollEff=0 → skip
    handlers.onMove({ height: 150 });
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
});

describe("blankSize — Android whenAtEnd behavior", () => {
  it("full absorption prevents scroll even when at end", () => {
    // Position at end: offset + layout >= content - threshold
    // 1180 + 800 = 1980 >= 2000 - 20 = 1980
    mockOffset.value = 1180;
    render({
      inverted: false,
      keyboardLiftBehavior: "whenAtEnd",
      blankSize: sv(500),
    });

    handlers.onStart({ height: KEYBOARD });
    // blankAbsorbed=500, scrollEff=0 → sentinel → no scroll
    handlers.onMove({ height: KEYBOARD });
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
});
