import "@testing-library/jest-native/extend-expect";

jest.mock(
  "react-native/Libraries/Interaction/InteractionManager",
  () => ({
    runAfterInteractions: (task?: (() => void) | { gen?: () => Promise<void> }) => {
      if (typeof task === "function") {
        task();
      } else if (typeof task?.gen === "function") {
        void task.gen();
      }

      return {
        cancel: jest.fn()
      };
    },
    createInteractionHandle: jest.fn(),
    clearInteractionHandle: jest.fn()
  })
);
