import "@testing-library/jest-native/extend-expect";

jest.mock(
  "react-native/Libraries/Interaction/InteractionManager",
  () => {
    const { act: mockAct } = require("@testing-library/react-native");

    return {
      runAfterInteractions: (task?: (() => void) | { gen?: () => Promise<void> }) => {
        if (typeof task === "function") {
          mockAct(() => {
            task();
          });
        } else if (typeof task?.gen === "function") {
          void mockAct(async () => {
            await task.gen?.();
          });
        }

        return {
          cancel: jest.fn()
        };
      },
      createInteractionHandle: jest.fn(),
      clearInteractionHandle: jest.fn()
    };
  }
);
