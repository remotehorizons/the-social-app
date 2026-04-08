import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppScreen } from "../../App";
import { MeshCore } from "../core/meshCore";
import { themes } from "../theme";
import {
  AppStats,
  ConversationPreview,
  DirectMessage,
  Identity,
  NetworkPeer,
  Post
} from "../types";

const identity: Identity = {
  pubkey: "local-user-pubkey",
  handle: "@you",
  displayName: "You",
  bio: "Building calm local-first social."
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

function makeConversation(
  peerPubkey: string,
  overrides: Partial<ConversationPreview> = {}
): ConversationPreview {
  return {
    peerPubkey,
    peerHandle: peerPubkey === "peer-atlas" ? "@atlas" : "@noor",
    peerDisplayName: peerPubkey === "peer-atlas" ? "Atlas" : "Noor",
    lastMessageBody: "existing message",
    lastMessageAtMs: 1,
    lastMessageAt: "8:00 AM",
    unreadCount: 0,
    ...overrides
  };
}

function makeMessage(
  id: string,
  body: string,
  overrides: Partial<DirectMessage> = {}
): DirectMessage {
  return {
    id,
    conversationId: "local-user-pubkey:peer-atlas",
    senderPubkey: "peer-atlas",
    recipientPubkey: identity.pubkey,
    body,
    createdAtMs: 1,
    createdAt: "8:00 AM",
    isLocalAuthor: false,
    ...overrides
  };
}

function makePeer(
  pubkey: string,
  overrides: Partial<NetworkPeer> = {}
): NetworkPeer {
  return {
    pubkey,
    handle: pubkey === identity.pubkey ? identity.handle : `@${pubkey.replace("peer-", "")}`,
    displayName: pubkey === identity.pubkey ? identity.displayName : "Peer",
    bio: "bio",
    isSelf: pubkey === identity.pubkey,
    isFollowing: false,
    postCount: 1,
    lastPostAtMs: 1,
    lastPostAt: "8:00 AM",
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
    [makePost("post-11", "older post", 11)]
  ];

  const conversations: ConversationPreview[] = [
    makeConversation("peer-atlas", {
      lastMessageBody: "See you on the peer link.",
      unreadCount: 1
    }),
    makeConversation("peer-noor", {
      lastMessageBody: "Quiet timeline today.",
      lastMessageAtMs: 2,
      lastMessageAt: "8:05 AM"
    })
  ];

  const peers: NetworkPeer[] = [
    makePeer(identity.pubkey, {
      displayName: identity.displayName,
      bio: identity.bio,
      isSelf: true,
      isFollowing: false,
      postCount: 0,
      lastPostAtMs: null,
      lastPostAt: null
    }),
    makePeer("peer-atlas", {
      displayName: "Atlas",
      bio: "Quiet builder.",
      isFollowing: true
    }),
    makePeer("peer-noor", {
      displayName: "Noor",
      bio: "Writes short updates.",
      isFollowing: false
    })
  ];

  const messagesByPeer: Record<string, DirectMessage[]> = {
    "peer-atlas": [
      makeMessage("message-1", "See you on the peer link."),
      makeMessage("message-2", "Reply from local user", {
        senderPubkey: identity.pubkey,
        recipientPubkey: "peer-atlas",
        isLocalAuthor: true
      })
    ],
    "peer-noor": [
      makeMessage("message-3", "Quiet timeline today.", {
        conversationId: "local-user-pubkey:peer-noor",
        senderPubkey: "peer-noor",
        recipientPubkey: identity.pubkey
      })
    ]
  };

  const getStats = (): AppStats => ({
    localPostCount: (pages[0] ?? []).filter((post) => post.authorPubkey === identity.pubkey)
      .length,
    followingCount: peers.filter((peer) => peer.isFollowing).length,
    conversationCount: conversations.length,
    unreadCount: conversations.reduce(
      (count, conversation) => count + conversation.unreadCount,
      0
    )
  });

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

  const updateProfile = jest.fn(async (displayName: string, bio: string) => {
    identity.displayName = displayName;
    identity.bio = bio;
    peers[0] = {
      ...peers[0]!,
      displayName,
      bio
    };

    return identity;
  });

  const listConversations = jest.fn(async () => conversations);
  const getMessages = jest.fn(async (peerPubkey: string) => messagesByPeer[peerPubkey] ?? []);
  const getAppStats = jest.fn(async () => getStats());
  const listPeers = jest.fn(async () => peers);
  const markConversationRead = jest.fn(async (peerPubkey: string) => {
    const conversation = conversations.find((item) => item.peerPubkey === peerPubkey);
    if (conversation) {
      conversation.unreadCount = 0;
    }
  });
  const sendMessage = jest.fn(async (peerPubkey: string, body: string) => {
    const newMessage = makeMessage("message-local", body, {
      conversationId: ["local-user-pubkey", peerPubkey].sort().join(":"),
      senderPubkey: identity.pubkey,
      recipientPubkey: peerPubkey,
      isLocalAuthor: true,
      createdAt: "now",
      createdAtMs: 99
    });

    messagesByPeer[peerPubkey] = [...(messagesByPeer[peerPubkey] ?? []), newMessage];

    const conversationIndex = conversations.findIndex(
      (conversation) => conversation.peerPubkey === peerPubkey
    );

    if (conversationIndex >= 0) {
      const existingConversation = conversations[conversationIndex]!;

      conversations[conversationIndex] = {
        ...existingConversation,
        lastMessageBody: body,
        lastMessageAt: "now",
        lastMessageAtMs: 99,
        unreadCount: 0
      };
    }

    return "message-local";
  });
  const followPeer = jest.fn(async (peerPubkey: string) => {
    const peer = peers.find((item) => item.pubkey === peerPubkey);
    if (peer) {
      peer.isFollowing = true;
    }
  });
  const unfollowPeer = jest.fn(async (peerPubkey: string) => {
    const peer = peers.find((item) => item.pubkey === peerPubkey);
    if (peer) {
      peer.isFollowing = false;
    }
  });

  const core: MeshCore = {
    bootstrap: jest.fn(async () => {}),
    getIdentity: jest.fn(async () => identity),
    updateProfile,
    getAppStats,
    getFeedPage: jest.fn(async (page: number) => pages[page] ?? []),
    publishPost,
    listPeers,
    followPeer,
    unfollowPeer,
    listConversations,
    getMessages,
    markConversationRead,
    sendMessage
  };

  return {
    core,
    publishPost,
    sendMessage,
    getMessages,
    updateProfile,
    followPeer,
    markConversationRead
  };
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
    expect(core.getAppStats).toHaveBeenCalledTimes(1);
    expect(core.getFeedPage).toHaveBeenCalledWith(0, 10);
    expect(core.listPeers).toHaveBeenCalledTimes(1);
    expect(core.listConversations).toHaveBeenCalledTimes(1);
    expect(core.getMessages).toHaveBeenCalledWith("peer-atlas");
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

  it("updates the profile and follows a suggested connection", async () => {
    const { core, updateProfile, followPeer } = createMockCore();

    render(<AppScreen core={core} />);

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByTestId("network-tab"));

    fireEvent.changeText(screen.getByTestId("display-name-input"), "Builder");
    fireEvent.changeText(screen.getByTestId("bio-input"), "Making the graph useful.");
    fireEvent.press(screen.getByTestId("save-profile-button"));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith(
        "Builder",
        "Making the graph useful."
      );
    });

    fireEvent.press(screen.getAllByTestId("follow-toggle-peer-noor")[0]!);

    await waitFor(() => {
      expect(followPeer).toHaveBeenCalledWith("peer-noor");
    });
  });

  it("shows conversations, clears unread count, and sends a message", async () => {
    const { core, sendMessage, getMessages, markConversationRead } = createMockCore();

    render(<AppScreen core={core} />);

    await waitFor(() => {
      expect(core.getMessages).toHaveBeenCalledWith("peer-atlas");
    });

    fireEvent.press(screen.getByTestId("messages-tab"));
    fireEvent.press(screen.getByTestId("conversation-peer-atlas"));

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledWith("peer-atlas");
    });

    fireEvent.changeText(screen.getByTestId("message-input"), "message from test");
    fireEvent.press(screen.getByTestId("send-message-button"));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith("peer-atlas", "message from test");
    });

    await waitFor(() => {
      expect(getMessages).toHaveBeenCalledWith("peer-atlas");
      expect(screen.getAllByText("message from test").length).toBeGreaterThan(0);
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
