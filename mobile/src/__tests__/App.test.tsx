import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppScreen } from "../../App";
import { MeshCore } from "../core/meshCore";
import { themes } from "../theme";
import { Identity, Post } from "../types";

const identity: Identity = {
  pubkey: "local-user-pubkey",
  handle: "@you",
  displayName: "You"
};

function makePost(
  id: string,
  body: string,
  createdAtMs: number,
  overrides: Partial<Post> = {}
): Post {
  return {
    id,
    authorPubkey: "peer-atlas",
    authorHandle: "@atlas",
    displayName: "Atlas",
    body,
    createdAtMs,
    createdAt: "8:00 AM",
    isLocalAuthor: false,
    ...overrides
  };
}

function createMockCore() {
  const pages: Post[][] = [
    Array.from({ length: 10 }, (_, index) =>
      makePost(
        `post-${index + 1}`,
        index === 0 ? "first network post" : `network post ${index + 1}`,
        index + 1
      )
    ),
    [makePost("post-3", "older post", 3)]
  ];
  const publishPost = jest.fn(async (body: string) => {
    pages[0] = [
      makePost("local-post", body, 10, {
        authorPubkey: identity.pubkey,
        authorHandle: identity.handle,
        displayName: identity.displayName,
        createdAt: "now",
        isLocalAuthor: true
      }),
      ...(pages[0] ?? [])
    ];

    return "local-post";
  });

  const core: MeshCore = {
    bootstrap: jest.fn(async () => {}),
    getIdentity: jest.fn(async () => identity),
    getFeedPage: jest.fn(async (page: number) => pages[page] ?? []),
    publishPost
  };

  return { core, publishPost };
}

describe("AppScreen", () => {
  it("loads the first feed page from the backend", async () => {
    const { core } = createMockCore();

    render(<AppScreen core={core} />);

    expect(screen.getByText("LOADING LOCAL TIMELINE")).toBeOnTheScreen();

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    expect(core.bootstrap).toHaveBeenCalledTimes(1);
    expect(core.getIdentity).toHaveBeenCalledTimes(1);
    expect(core.getFeedPage).toHaveBeenCalledWith(0, 10);
  });

  it("publishes a post and refreshes the first page", async () => {
    const { core, publishPost } = createMockCore();

    render(<AppScreen core={core} />);

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByTestId("composer-input"), "hello from test");
    fireEvent.press(screen.getByTestId("post-button"));

    await waitFor(() => {
      expect(publishPost).toHaveBeenCalledWith("hello from test");
    });

    await waitFor(() => {
      expect(screen.getByText("hello from test")).toBeOnTheScreen();
    });
  });

  it("loads the next page when asked", async () => {
    const { core } = createMockCore();

    render(<AppScreen core={core} />);

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByTestId("load-older-button"));

    await waitFor(() => {
      expect(core.getFeedPage).toHaveBeenCalledWith(1, 10);
    });
  });

  it("toggles between light and dark mode", async () => {
    const { core } = createMockCore();

    render(<AppScreen core={core} />);

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    expect(screen.getByTestId("app-shell")).toHaveStyle({
      backgroundColor: themes.light.bg
    });
    expect(screen.getByText("DARK MODE")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("mode-toggle"));

    expect(screen.getByTestId("app-shell")).toHaveStyle({
      backgroundColor: themes.dark.bg
    });
    expect(screen.getByText("LIGHT MODE")).toBeOnTheScreen();
  });
});
