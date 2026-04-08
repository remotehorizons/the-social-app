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
    peerHandle: peerPubkey === "peer-atlas" ? "@atlas" : "@rae",
    peerDisplayName: peerPubkey === "peer-atlas" ? "Atlas" : "Rae",
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
    isMuted: false,
    isBlocked: false,
    postCount: 1,
    lastPostAtMs: 1,
    lastPostAt: "8:00 AM",
    ...overrides
  };
}

function createMockCore() {
  const basePosts: Post[] = [
    makePost("post-1", "first network post", 2),
    makePost("post-2", "second network post", 1)
  ];

  const peers: NetworkPeer[] = [
    makePeer(identity.pubkey, {
      displayName: identity.displayName,
      bio: identity.bio,
      isSelf: true,
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
      bio: "Writes short updates."
    }),
    makePeer("peer-rae", {
      displayName: "Rae",
      bio: "Strong on community rituals.",
      isFollowing: true
    })
  ];

  const conversations: ConversationPreview[] = [
    makeConversation("peer-atlas", {
      lastMessageBody: "See you on the peer link.",
      unreadCount: 1
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
    "peer-rae": []
  };

  const getPeer = (pubkey: string) => peers.find((peer) => peer.pubkey === pubkey);

  const getVisibleFeed = () => {
    const visibleAuthors = new Set(
      peers
        .filter((peer) => peer.isFollowing && !peer.isMuted && !peer.isBlocked)
        .map((peer) => peer.pubkey)
    );

    return basePosts.filter(
      (post) => post.authorPubkey === identity.pubkey || visibleAuthors.has(post.authorPubkey)
    );
  };

  const getVisibleConversations = () =>
    conversations.filter((conversation) => !getPeer(conversation.peerPubkey)?.isBlocked);

  const getStats = (): AppStats => ({
    localPostCount: getVisibleFeed().filter((post) => post.authorPubkey === identity.pubkey)
      .length,
    followingCount: peers.filter((peer) => peer.isFollowing).length,
    conversationCount: getVisibleConversations().length,
    unreadCount: getVisibleConversations().reduce(
      (count, conversation) => count + conversation.unreadCount,
      0
    ),
    mutedCount: peers.filter((peer) => peer.isMuted).length,
    blockedCount: peers.filter((peer) => peer.isBlocked).length
  });

  const publishPost = jest.fn(async (body: string) => {
    basePosts.unshift(
      makePost("local-post", body, 10, {
        authorPubkey: identity.pubkey,
        authorHandle: identity.handle,
        displayName: identity.displayName,
        createdAt: "now",
        isLocalAuthor: true
      })
    );

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

  const getFeedPage = jest.fn(async (page: number, pageSize: number) => {
    const visibleFeed = getVisibleFeed();
    const offset = page * pageSize;
    return visibleFeed.slice(offset, offset + pageSize);
  });
  const listConversations = jest.fn(async () => getVisibleConversations());
  const getMessages = jest.fn(async (peerPubkey: string) => {
    if (getPeer(peerPubkey)?.isBlocked) {
      return [];
    }
    return messagesByPeer[peerPubkey] ?? [];
  });
  const getAppStats = jest.fn(async () => getStats());
  const listPeers = jest.fn(async () => peers);
  const markConversationRead = jest.fn(async (peerPubkey: string) => {
    const conversation = conversations.find((item) => item.peerPubkey === peerPubkey);
    if (conversation) {
      conversation.unreadCount = 0;
    }
  });
  const sendMessage = jest.fn(async (peerPubkey: string, body: string) => {
    const newMessage = makeMessage(`message-${peerPubkey}-local`, body, {
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
      conversations[conversationIndex] = {
        ...conversations[conversationIndex]!,
        lastMessageBody: body,
        lastMessageAt: "now",
        lastMessageAtMs: 99,
        unreadCount: 0
      };
    } else {
      conversations.unshift(
        makeConversation(peerPubkey, {
          peerHandle: getPeer(peerPubkey)?.handle ?? "@peer",
          peerDisplayName: getPeer(peerPubkey)?.displayName ?? "Peer",
          lastMessageBody: body,
          lastMessageAt: "now",
          lastMessageAtMs: 99
        })
      );
    }

    return "message-local";
  });
  const followPeer = jest.fn(async (peerPubkey: string) => {
    const peer = getPeer(peerPubkey);
    if (peer) {
      peer.isFollowing = true;
    }
  });
  const unfollowPeer = jest.fn(async (peerPubkey: string) => {
    const peer = getPeer(peerPubkey);
    if (peer) {
      peer.isFollowing = false;
    }
  });
  const mutePeer = jest.fn(async (peerPubkey: string) => {
    const peer = getPeer(peerPubkey);
    if (peer) {
      peer.isMuted = true;
    }
  });
  const unmutePeer = jest.fn(async (peerPubkey: string) => {
    const peer = getPeer(peerPubkey);
    if (peer) {
      peer.isMuted = false;
    }
  });
  const blockPeer = jest.fn(async (peerPubkey: string) => {
    const peer = getPeer(peerPubkey);
    if (peer) {
      peer.isBlocked = true;
      peer.isFollowing = false;
    }
  });
  const unblockPeer = jest.fn(async (peerPubkey: string) => {
    const peer = getPeer(peerPubkey);
    if (peer) {
      peer.isBlocked = false;
    }
  });

  const core: MeshCore = {
    bootstrap: jest.fn(async () => {}),
    getIdentity: jest.fn(async () => identity),
    updateProfile,
    getAppStats,
    getFeedPage,
    publishPost,
    listPeers,
    followPeer,
    unfollowPeer,
    mutePeer,
    unmutePeer,
    blockPeer,
    unblockPeer,
    listConversations,
    getMessages,
    markConversationRead,
    sendMessage
  };

  return {
    core,
    publishPost,
    updateProfile,
    followPeer,
    mutePeer,
    blockPeer,
    sendMessage,
    getMessages,
    markConversationRead
  };
}

describe("AppScreen", () => {
  it("loads the first feed page and launch checklist", async () => {
    const { core } = createMockCore();

    render(<AppScreen core={core} />);

    expect(screen.getByText("LOADING LOCAL TIMELINE")).toBeOnTheScreen();

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    expect(screen.getByText("LAUNCH READINESS")).toBeOnTheScreen();
    expect(screen.getByTestId("launch-task-profile")).toBeOnTheScreen();
    expect(core.bootstrap).toHaveBeenCalledTimes(1);
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

  it("starts a first-contact thread from the network tab and sends a message", async () => {
    const { core, sendMessage, getMessages } = createMockCore();

    render(<AppScreen core={core} />);

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByTestId("network-tab"));
    fireEvent.press(screen.getAllByTestId("message-peer-peer-rae")[0]!);

    await waitFor(() => {
      expect(getMessages).toHaveBeenCalledWith("peer-rae");
      expect(screen.getByText("FIRST CONTACT PROMPTS")).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByTestId("message-input"), "intro from test");
    fireEvent.press(screen.getByTestId("send-message-button"));

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith("peer-rae", "intro from test");
    });

    await waitFor(() => {
      expect(screen.getAllByText("intro from test").length).toBeGreaterThan(0);
    });
  });

  it("mutes and blocks a peer through network controls", async () => {
    const { core, mutePeer, blockPeer } = createMockCore();

    render(<AppScreen core={core} />);

    await waitFor(() => {
      expect(screen.getByText("first network post")).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByTestId("network-tab"));
    fireEvent.press(screen.getAllByTestId("mute-toggle-peer-atlas")[0]!);

    await waitFor(() => {
      expect(mutePeer).toHaveBeenCalledWith("peer-atlas");
    });

    await waitFor(() => {
      expect(screen.getAllByText("MUTED").length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getAllByTestId("block-toggle-peer-atlas")[0]!);

    await waitFor(() => {
      expect(blockPeer).toHaveBeenCalledWith("peer-atlas");
    });

    fireEvent.press(screen.getByTestId("feed-tab"));

    await waitFor(() => {
      expect(screen.getByText("YOUR FEED IS EMPTY. FOLLOW PEOPLE IN NETWORK TO START THE LOOP.")).toBeOnTheScreen();
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
