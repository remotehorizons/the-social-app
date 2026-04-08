import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MessageBubble } from "./src/components/MessageBubble";
import { PostCard } from "./src/components/PostCard";
import { createMeshCore, MeshCore } from "./src/core/meshCore";
import { theme, themes, ColorMode } from "./src/theme";
import {
  AppStats,
  ConversationPreview,
  DirectMessage,
  Identity,
  NetworkPeer,
  Post
} from "./src/types";

type AppScreenProps = {
  core: MeshCore;
};

type AppTab = "feed" | "network" | "messages";

const emptyStats: AppStats = {
  localPostCount: 0,
  followingCount: 0,
  conversationCount: 0,
  unreadCount: 0,
  mutedCount: 0,
  blockedCount: 0
};

const introPrompts = [
  "Saw your profile and wanted to say hi. What are you building this week?",
  "Your updates look aligned with what I care about. Want to trade notes?",
  "I am curating a small high-signal circle here. Thought you should be in it."
];

export default function App() {
  const [core] = useState(() => createMeshCore());

  return <AppScreen core={core} />;
}

export function AppScreen({ core }: AppScreenProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("feed");
  const [composerText, setComposerText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [profileDraft, setProfileDraft] = useState({ displayName: "", bio: "" });
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [stats, setStats] = useState<AppStats>(emptyStats);
  const [posts, setPosts] = useState<Post[]>([]);
  const [peers, setPeers] = useState<NetworkPeer[]>([]);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [selectedPeerPubkey, setSelectedPeerPubkey] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("light");

  const palette = themes[colorMode];
  const styles = createStyles(palette);
  const remainingChars = theme.postCharLimit - composerText.length;
  const remainingMessageChars = theme.postCharLimit - messageText.length;
  const canPost =
    composerText.trim().length > 0 && composerText.length <= theme.postCharLimit;
  const canSendMessage =
    messageText.trim().length > 0 &&
    messageText.length <= theme.postCharLimit &&
    selectedPeerPubkey !== null;
  const canSaveProfile = profileDraft.displayName.trim().length > 0;
  const selectedConversation =
    conversations.find((conversation) => conversation.peerPubkey === selectedPeerPubkey) ??
    null;
  const selectedPeer =
    peers.find((peer) => peer.pubkey === selectedPeerPubkey) ??
    (selectedConversation
      ? {
          pubkey: selectedConversation.peerPubkey,
          handle: selectedConversation.peerHandle,
          displayName: selectedConversation.peerDisplayName,
          bio: "",
          isSelf: false,
          isFollowing: true,
          isMuted: false,
          isBlocked: false,
          postCount: 0,
          lastPostAtMs: null,
          lastPostAt: null
        }
      : null);
  const onboardingReady =
    stats.followingCount >= 2 && stats.localPostCount >= 1 && stats.conversationCount >= 1;
  const launchTasks = buildLaunchTasks(stats, identity);
  const launchCompletion = Math.round(
    (launchTasks.filter((task) => task.done).length / launchTasks.length) * 100
  );

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        setErrorMessage(null);
        await core.bootstrap();

        const snapshot = await loadSnapshot(core);
        if (!isMounted) {
          return;
        }

        applySnapshot(snapshot);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      isMounted = false;
    };
  }, [core]);

  const applySnapshot = (snapshot: Snapshot) => {
    setIdentity(snapshot.identity);
    setProfileDraft({
      displayName: snapshot.identity.displayName,
      bio: snapshot.identity.bio
    });
    setStats(snapshot.stats);
    setPosts(snapshot.feed);
    setPage(0);
    setHasMore(snapshot.feed.length === theme.pageSize);
    setPeers(snapshot.peers);
    setConversations(snapshot.conversations);

    const nextSelectedPeerPubkey = chooseSelectedPeer(
      snapshot.conversations,
      snapshot.peers,
      selectedPeerPubkey
    );
    setSelectedPeerPubkey(nextSelectedPeerPubkey);
    setMessages(
      nextSelectedPeerPubkey ? snapshot.messagesByPeer[nextSelectedPeerPubkey] ?? [] : []
    );
  };

  const refreshAppData = async (nextSelectedPeer = selectedPeerPubkey) => {
    const snapshot = await loadSnapshot(core, nextSelectedPeer);
    applySnapshot(snapshot);
  };

  const loadConversation = async (peerPubkey: string) => {
    try {
      setIsLoadingMessages(true);
      setErrorMessage(null);
      await core.markConversationRead(peerPubkey);
      const [nextMessages, nextConversations, nextStats] = await Promise.all([
        core.getMessages(peerPubkey),
        core.listConversations(),
        core.getAppStats()
      ]);

      setSelectedPeerPubkey(peerPubkey);
      setMessages(nextMessages);
      setConversations(nextConversations);
      setStats(nextStats);
      if (nextMessages.length === 0 && messageText.length === 0) {
        setMessageText(introPrompts[0] ?? "");
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const publishPost = async () => {
    if (!canPost || isPosting) {
      return;
    }

    try {
      setIsPosting(true);
      setErrorMessage(null);
      await core.publishPost(composerText.trim());
      setComposerText("");
      await refreshAppData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsPosting(false);
    }
  };

  const saveProfile = async () => {
    if (!canSaveProfile || isSavingProfile) {
      return;
    }

    try {
      setIsSavingProfile(true);
      setErrorMessage(null);
      const nextIdentity = await core.updateProfile(
        profileDraft.displayName,
        profileDraft.bio
      );
      setIdentity(nextIdentity);
      setProfileDraft({
        displayName: nextIdentity.displayName,
        bio: nextIdentity.bio
      });
      await refreshAppData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const toggleFollow = async (peer: NetworkPeer) => {
    if (peer.isSelf || peer.isBlocked || busyActionKey) {
      return;
    }

    try {
      setBusyActionKey(`follow:${peer.pubkey}`);
      setErrorMessage(null);
      if (peer.isFollowing) {
        await core.unfollowPeer(peer.pubkey);
      } else {
        await core.followPeer(peer.pubkey);
      }
      await refreshAppData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyActionKey(null);
    }
  };

  const toggleMute = async (peer: NetworkPeer) => {
    if (peer.isSelf || peer.isBlocked || busyActionKey) {
      return;
    }

    try {
      setBusyActionKey(`mute:${peer.pubkey}`);
      setErrorMessage(null);
      if (peer.isMuted) {
        await core.unmutePeer(peer.pubkey);
      } else {
        await core.mutePeer(peer.pubkey);
      }
      await refreshAppData(selectedPeerPubkey === peer.pubkey ? peer.pubkey : selectedPeerPubkey);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyActionKey(null);
    }
  };

  const toggleBlock = async (peer: NetworkPeer) => {
    if (peer.isSelf || busyActionKey) {
      return;
    }

    try {
      setBusyActionKey(`block:${peer.pubkey}`);
      setErrorMessage(null);
      if (peer.isBlocked) {
        await core.unblockPeer(peer.pubkey);
      } else {
        await core.blockPeer(peer.pubkey);
      }

      if (selectedPeerPubkey === peer.pubkey && !peer.isBlocked) {
        setSelectedPeerPubkey(null);
        setMessageText("");
      }

      await refreshAppData(
        selectedPeerPubkey === peer.pubkey && !peer.isBlocked ? null : selectedPeerPubkey
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyActionKey(null);
    }
  };

  const startConversation = (peer: NetworkPeer, prompt?: string) => {
    if (peer.isSelf || peer.isBlocked) {
      return;
    }

    setSelectedPeerPubkey(peer.pubkey);
    setActiveTab("messages");
    setMessageText(prompt ?? "");
    setMessages([]);
    void loadConversation(peer.pubkey);
  };

  const sendMessage = async () => {
    if (!selectedPeerPubkey || !canSendMessage || isSendingMessage) {
      return;
    }

    try {
      setIsSendingMessage(true);
      setErrorMessage(null);
      await core.sendMessage(selectedPeerPubkey, messageText.trim());
      setMessageText("");
      await refreshAppData(selectedPeerPubkey);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSendingMessage(false);
    }
  };

  const loadOlder = async () => {
    if (!hasMore || isLoadingOlder) {
      return;
    }

    try {
      setIsLoadingOlder(true);
      setErrorMessage(null);

      const nextPage = page + 1;
      const nextPosts = await core.getFeedPage(nextPage, theme.pageSize);

      setPosts((currentPosts) => [...currentPosts, ...nextPosts]);
      setPage(nextPage);
      setHasMore(nextPosts.length === theme.pageSize);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const toggleColorMode = () => {
    setColorMode((currentMode) => (currentMode === "light" ? "dark" : "light"));
  };

  const jumpToTask = (taskAction: LaunchTask["action"]) => {
    if (taskAction === "profile") {
      setActiveTab("network");
      return;
    }
    if (taskAction === "follow") {
      setActiveTab("network");
      return;
    }
    if (taskAction === "post") {
      setActiveTab("feed");
      return;
    }
    setActiveTab("messages");
  };

  const networkSuggestions = peers.filter(
    (peer) => !peer.isSelf && !peer.isFollowing && !peer.isBlocked
  );

  return (
    <SafeAreaView style={styles.safe} testID="app-shell">
      <StatusBar style={colorMode === "light" ? "dark" : "light"} />
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>MESHSOCIAL</Text>
              <Text style={styles.subtitle}>
                {identity
                  ? `${identity.handle} on local sqlite, direct peers only`
                  : "text-only network, direct peers"}
              </Text>
            </View>
            <Pressable
              onPress={toggleColorMode}
              style={styles.modeButton}
              testID="mode-toggle"
            >
              <Text style={styles.modeButtonText}>
                {colorMode === "light" ? "DARK MODE" : "LIGHT MODE"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <MetricCard label="Posts" value={stats.localPostCount} palette={palette} />
            <MetricCard label="Following" value={stats.followingCount} palette={palette} />
            <MetricCard label="Threads" value={stats.conversationCount} palette={palette} />
            <MetricCard label="Unread" value={stats.unreadCount} palette={palette} />
          </View>

          <View style={styles.tabBar}>
            {(["feed", "network", "messages"] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tabButton,
                  activeTab === tab && styles.tabButtonActive
                ]}
                testID={`${tab}-tab`}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === tab && styles.tabButtonTextActive
                  ]}
                >
                  {tab === "feed" ? "FEED" : tab === "network" ? "NETWORK" : "MESSAGES"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {activeTab === "feed" ? (
          <>
            <View style={styles.callout}>
              <View style={styles.launchHeader}>
                <View>
                  <Text style={styles.calloutTitle}>LAUNCH READINESS</Text>
                  <Text style={styles.calloutBody}>
                    One-week market plan: tighten trust, create first contact fast, and make
                    the first session feel complete.
                  </Text>
                </View>
                <Text style={styles.launchScore}>{launchCompletion}%</Text>
              </View>
              <View style={styles.launchTaskList}>
                {launchTasks.map((task) => (
                  <Pressable
                    key={task.label}
                    onPress={() => jumpToTask(task.action)}
                    style={styles.launchTask}
                    testID={`launch-task-${task.action}`}
                  >
                    <Text style={styles.launchTaskStatus}>
                      {task.done ? "DONE" : "OPEN"}
                    </Text>
                    <View style={styles.launchTaskCopy}>
                      <Text style={styles.launchTaskTitle}>{task.label}</Text>
                      <Text style={styles.launchTaskBody}>{task.body}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              {!onboardingReady ? (
                <Text style={styles.helperText}>
                  Do these in order. Social products fail when the first user never reaches a
                  meaningful interaction loop.
                </Text>
              ) : null}
            </View>

            <View style={styles.composer}>
              <Text style={styles.sectionTitle}>POST TO YOUR CIRCLE</Text>
              <TextInput
                placeholder="Share one useful thought..."
                placeholderTextColor={palette.textMuted}
                multiline
                style={styles.input}
                maxLength={theme.postCharLimit}
                value={composerText}
                onChangeText={setComposerText}
                testID="composer-input"
              />
              <View style={styles.composerFooter}>
                <Text style={styles.counter}>{remainingChars} chars left</Text>
                <Pressable
                  onPress={() => void publishPost()}
                  disabled={!canPost || isPosting}
                  style={({ pressed }) => [
                    styles.postButton,
                    (!canPost || isPosting || pressed) && styles.postButtonDisabled
                  ]}
                  testID="post-button"
                >
                  <Text style={styles.postButtonText}>
                    {isPosting ? "POSTING" : "POST"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <PostCard post={item} palette={palette} />}
              contentContainerStyle={styles.feed}
              ListEmptyComponent={
                isLoading ? (
                  <Text style={styles.emptyState}>LOADING LOCAL TIMELINE</Text>
                ) : (
                  <Text style={styles.emptyState}>
                    YOUR FEED IS EMPTY. FOLLOW PEOPLE IN NETWORK TO START THE LOOP.
                  </Text>
                )
              }
              ListFooterComponent={
                <View style={styles.footer}>
                  {hasMore ? (
                    <Pressable
                      onPress={() => void loadOlder()}
                      style={styles.loadMoreButton}
                      testID="load-older-button"
                    >
                      <Text style={styles.loadMoreText}>
                        {isLoadingOlder ? "LOADING" : "LOAD OLDER"}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.caughtUp}>YOU ARE CAUGHT UP</Text>
                  )}
                </View>
              }
            />
          </>
        ) : null}

        {activeTab === "network" ? (
          <ScrollView contentContainerStyle={styles.networkPage}>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>PROFILE</Text>
              <TextInput
                value={profileDraft.displayName}
                onChangeText={(displayName) =>
                  setProfileDraft((current) => ({ ...current, displayName }))
                }
                placeholder="Display name"
                placeholderTextColor={palette.textMuted}
                style={styles.singleLineInput}
                testID="display-name-input"
              />
              <TextInput
                value={profileDraft.bio}
                onChangeText={(bio) => setProfileDraft((current) => ({ ...current, bio }))}
                placeholder="Tell people what you care about"
                placeholderTextColor={palette.textMuted}
                multiline
                style={styles.input}
                testID="bio-input"
              />
              <View style={styles.composerFooter}>
                <Text style={styles.helperText}>
                  People decide whether to follow you from this card.
                </Text>
                <Pressable
                  onPress={() => void saveProfile()}
                  disabled={!canSaveProfile || isSavingProfile}
                  style={({ pressed }) => [
                    styles.postButton,
                    (!canSaveProfile || isSavingProfile || pressed) &&
                      styles.postButtonDisabled
                  ]}
                  testID="save-profile-button"
                >
                  <Text style={styles.postButtonText}>
                    {isSavingProfile ? "SAVING" : "SAVE"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>GROWTH PLAN</Text>
              <Text style={styles.calloutBody}>
                Successful calm social products win on trust, not infinite reach. Ship the
                small graph, make intros easy, and let people tune noise with mute and block.
              </Text>
              <Text style={styles.helperText}>
                Safety controls shipped here affect the feed and messaging state immediately.
              </Text>
            </View>

            {networkSuggestions.length > 0 ? (
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>SUGGESTED CONNECTIONS</Text>
                {networkSuggestions.map((peer, index) => (
                  <PeerRow
                    key={peer.pubkey}
                    peer={peer}
                    palette={palette}
                    busyActionKey={busyActionKey}
                    onToggleFollow={() => void toggleFollow(peer)}
                    onToggleMute={() => void toggleMute(peer)}
                    onToggleBlock={() => void toggleBlock(peer)}
                    onMessage={() => startConversation(peer, introPrompts[index % 3])}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>YOUR NETWORK</Text>
              {peers.map((peer) => (
                <PeerRow
                  key={peer.pubkey}
                  peer={peer}
                  palette={palette}
                  busyActionKey={busyActionKey}
                  onToggleFollow={() => void toggleFollow(peer)}
                  onToggleMute={() => void toggleMute(peer)}
                  onToggleBlock={() => void toggleBlock(peer)}
                  onMessage={() => startConversation(peer)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}

        {activeTab === "messages" ? (
          <View style={styles.messagesLayout}>
            <View style={styles.conversationRail}>
              {conversations.length > 0 ? (
                conversations.map((conversation) => (
                  <Pressable
                    key={conversation.peerPubkey}
                    onPress={() => void loadConversation(conversation.peerPubkey)}
                    style={[
                      styles.conversationButton,
                      selectedPeerPubkey === conversation.peerPubkey &&
                        styles.conversationButtonActive
                    ]}
                    testID={`conversation-${conversation.peerPubkey}`}
                  >
                    <View style={styles.conversationTopRow}>
                      <Text style={styles.conversationName}>
                        {conversation.peerDisplayName}
                      </Text>
                      <Text style={styles.conversationTime}>
                        {conversation.lastMessageAt}
                      </Text>
                    </View>
                    <Text style={styles.conversationMeta}>{conversation.peerHandle}</Text>
                    <Text style={styles.conversationPreview} numberOfLines={2}>
                      {conversation.lastMessageBody}
                    </Text>
                    {conversation.unreadCount > 0 ? (
                      <Text style={styles.unreadBadge}>
                        {conversation.unreadCount} NEW
                      </Text>
                    ) : null}
                  </Pressable>
                ))
              ) : (
                <Text style={styles.emptyState}>NO DIRECT MESSAGES YET</Text>
              )}
            </View>

            {selectedPeer ? (
              <View style={styles.threadPanel}>
                <View style={styles.threadHeader}>
                  <Text style={styles.threadTitle}>{selectedPeer.displayName}</Text>
                  <Text style={styles.threadSubtitle}>{selectedPeer.handle}</Text>
                  {selectedPeer.bio ? (
                    <Text style={styles.threadBio}>{selectedPeer.bio}</Text>
                  ) : null}
                </View>

                <FlatList
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <MessageBubble message={item} palette={palette} />
                  )}
                  contentContainerStyle={styles.messagesList}
                  ListEmptyComponent={
                    isLoadingMessages ? (
                      <Text style={styles.emptyState}>LOADING CONVERSATION</Text>
                    ) : (
                      <Text style={styles.emptyState}>
                        NO MESSAGES IN THIS THREAD YET. SEND A CLEAR FIRST NOTE.
                      </Text>
                    )
                  }
                />

                {messages.length === 0 && !selectedPeer.isBlocked ? (
                  <View style={styles.introPromptPanel}>
                    <Text style={styles.sectionTitle}>FIRST CONTACT PROMPTS</Text>
                    {introPrompts.map((prompt) => (
                      <Pressable
                        key={prompt}
                        onPress={() => setMessageText(prompt)}
                        style={styles.introPromptButton}
                        testID={`intro-prompt-${prompt}`}
                      >
                        <Text style={styles.introPromptText}>{prompt}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View style={styles.composer}>
                  <Text style={styles.sectionTitle}>REPLY FAST</Text>
                  <TextInput
                    placeholder={`Message ${selectedPeer.handle}...`}
                    placeholderTextColor={palette.textMuted}
                    multiline
                    style={styles.input}
                    maxLength={theme.postCharLimit}
                    value={messageText}
                    onChangeText={setMessageText}
                    testID="message-input"
                  />
                  <View style={styles.composerFooter}>
                    <Text style={styles.counter}>
                      {remainingMessageChars} chars left
                    </Text>
                    <Pressable
                      onPress={() => void sendMessage()}
                      disabled={
                        !canSendMessage || isSendingMessage || Boolean(selectedPeer.isBlocked)
                      }
                      style={({ pressed }) => [
                        styles.postButton,
                        (!canSendMessage || isSendingMessage || selectedPeer.isBlocked || pressed) &&
                          styles.postButtonDisabled
                      ]}
                      testID="send-message-button"
                    >
                      <Text style={styles.postButtonText}>
                        {selectedPeer.isBlocked
                          ? "BLOCKED"
                          : isSendingMessage
                            ? "SENDING"
                            : "SEND"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.threadPanel}>
                <Text style={styles.emptyState}>SELECT A CONVERSATION</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

type Snapshot = {
  identity: Identity;
  stats: AppStats;
  feed: Post[];
  peers: NetworkPeer[];
  conversations: ConversationPreview[];
  messagesByPeer: Record<string, DirectMessage[]>;
};

async function loadSnapshot(
  core: MeshCore,
  selectedPeerPubkey?: string | null
): Promise<Snapshot> {
  const [identity, stats, feed, peers, conversations] = await Promise.all([
    core.getIdentity(),
    core.getAppStats(),
    core.getFeedPage(0, theme.pageSize),
    core.listPeers(),
    core.listConversations()
  ]);

  const nextSelectedPeerPubkey = chooseSelectedPeer(
    conversations,
    peers,
    selectedPeerPubkey ?? null
  );
  const messages = nextSelectedPeerPubkey
    ? await core.getMessages(nextSelectedPeerPubkey)
    : [];

  return {
    identity,
    stats,
    feed,
    peers,
    conversations,
    messagesByPeer: nextSelectedPeerPubkey
      ? { [nextSelectedPeerPubkey]: messages }
      : {}
  };
}

type LaunchTask = {
  action: "profile" | "follow" | "post" | "message";
  body: string;
  done: boolean;
  label: string;
};

function buildLaunchTasks(
  stats: AppStats,
  identity: Identity | null
): LaunchTask[] {
  const hasProfile = Boolean(identity?.displayName.trim() && identity.bio.trim().length > 0);

  return [
    {
      action: "profile",
      label: "Finish your profile",
      body: "A clear identity is the first filter for who follows and replies.",
      done: hasProfile
    },
    {
      action: "follow",
      label: "Curate your circle",
      body: "Follow at least two relevant peers so the feed has signal.",
      done: stats.followingCount >= 2
    },
    {
      action: "post",
      label: "Publish one useful post",
      body: "The first useful update gives people a reason to engage.",
      done: stats.localPostCount >= 1
    },
    {
      action: "message",
      label: "Start one direct thread",
      body: "The first reply loop is what turns curiosity into retention.",
      done: stats.conversationCount >= 1
    }
  ];
}

function chooseSelectedPeer(
  conversations: ConversationPreview[],
  peers: NetworkPeer[],
  selectedPeerPubkey: string | null
) {
  if (
    selectedPeerPubkey &&
    (conversations.some((conversation) => conversation.peerPubkey === selectedPeerPubkey) ||
      peers.some((peer) => peer.pubkey === selectedPeerPubkey && !peer.isBlocked))
  ) {
    return selectedPeerPubkey;
  }

  return conversations[0]?.peerPubkey ?? null;
}

function MetricCard({
  label,
  value,
  palette
}: {
  label: string;
  value: number;
  palette: (typeof themes)[ColorMode];
}) {
  const styles = createStyles(palette);

  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PeerRow({
  peer,
  palette,
  busyActionKey,
  onToggleFollow,
  onToggleMute,
  onToggleBlock,
  onMessage
}: {
  peer: NetworkPeer;
  palette: (typeof themes)[ColorMode];
  busyActionKey: string | null;
  onToggleFollow: () => void;
  onToggleMute: () => void;
  onToggleBlock: () => void;
  onMessage: () => void;
}) {
  const styles = createStyles(palette);
  const followBusy = busyActionKey === `follow:${peer.pubkey}`;
  const muteBusy = busyActionKey === `mute:${peer.pubkey}`;
  const blockBusy = busyActionKey === `block:${peer.pubkey}`;

  return (
    <View style={styles.peerRow}>
      <View style={styles.peerCopy}>
        <View style={styles.peerTitleRow}>
          <Text style={styles.peerName}>{peer.displayName}</Text>
          <Text style={styles.peerHandle}>{peer.handle}</Text>
          {peer.isMuted ? <Text style={styles.peerFlag}>MUTED</Text> : null}
          {peer.isBlocked ? <Text style={styles.peerFlag}>BLOCKED</Text> : null}
        </View>
        <Text style={styles.peerBio}>{peer.bio || "No profile bio yet."}</Text>
        <Text style={styles.peerMeta}>
          {peer.postCount} posts
          {peer.lastPostAt ? ` • last post ${peer.lastPostAt}` : ""}
        </Text>
      </View>
      <View style={styles.peerActions}>
        <Pressable
          disabled={peer.isSelf || peer.isBlocked || followBusy}
          onPress={onToggleFollow}
          style={({ pressed }) => [
            styles.followButton,
            (peer.isSelf || peer.isBlocked || followBusy || pressed) &&
              styles.followButtonDisabled
          ]}
          testID={`follow-toggle-${peer.pubkey}`}
        >
          <Text style={styles.followButtonText}>
            {peer.isSelf
              ? "YOU"
              : followBusy
                ? "..."
                : peer.isFollowing
                  ? "UNFOLLOW"
                  : "FOLLOW"}
          </Text>
        </Pressable>
        <Pressable
          disabled={peer.isSelf || peer.isBlocked}
          onPress={onMessage}
          style={({ pressed }) => [
            styles.secondaryActionButton,
            (peer.isSelf || peer.isBlocked || pressed) && styles.followButtonDisabled
          ]}
          testID={`message-peer-${peer.pubkey}`}
        >
          <Text style={styles.secondaryActionText}>MESSAGE</Text>
        </Pressable>
        <Pressable
          disabled={peer.isSelf || peer.isBlocked || muteBusy}
          onPress={onToggleMute}
          style={({ pressed }) => [
            styles.secondaryActionButton,
            (peer.isSelf || peer.isBlocked || muteBusy || pressed) &&
              styles.followButtonDisabled
          ]}
          testID={`mute-toggle-${peer.pubkey}`}
        >
          <Text style={styles.secondaryActionText}>
            {muteBusy ? "..." : peer.isMuted ? "UNMUTE" : "MUTE"}
          </Text>
        </Pressable>
        <Pressable
          disabled={peer.isSelf || blockBusy}
          onPress={onToggleBlock}
          style={({ pressed }) => [
            styles.secondaryActionButton,
            (peer.isSelf || blockBusy || pressed) && styles.followButtonDisabled
          ]}
          testID={`block-toggle-${peer.pubkey}`}
        >
          <Text style={styles.secondaryActionText}>
            {blockBusy ? "..." : peer.isBlocked ? "UNBLOCK" : "BLOCK"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(palette: (typeof themes)[ColorMode]) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: palette.bg
    },
    page: {
      flex: 1,
      backgroundColor: palette.bg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.sm
    },
    header: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.md,
      backgroundColor: palette.panel,
      gap: theme.spacing.sm
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.md
    },
    headerCopy: {
      flex: 1
    },
    title: {
      fontFamily: "Courier",
      letterSpacing: 1.5,
      fontSize: 20,
      fontWeight: "700",
      color: palette.textPrimary
    },
    subtitle: {
      marginTop: 4,
      fontFamily: "Courier",
      fontSize: 12,
      color: palette.textMuted
    },
    modeButton: {
      backgroundColor: palette.accent,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs
    },
    modeButtonText: {
      fontFamily: "Courier",
      color: palette.accentText,
      fontWeight: "700",
      fontSize: 12,
      letterSpacing: 0.8
    },
    statsRow: {
      flexDirection: "row",
      gap: theme.spacing.sm
    },
    metricCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
      backgroundColor: palette.bg,
      alignItems: "center"
    },
    metricValue: {
      fontFamily: "Courier",
      fontSize: 18,
      fontWeight: "700",
      color: palette.textPrimary
    },
    metricLabel: {
      fontFamily: "Courier",
      fontSize: 11,
      color: palette.textMuted
    },
    tabBar: {
      flexDirection: "row",
      gap: theme.spacing.sm
    },
    tabButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bg,
      borderRadius: theme.radius.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center"
    },
    tabButtonActive: {
      backgroundColor: palette.accent
    },
    tabButtonText: {
      fontFamily: "Courier",
      fontSize: 12,
      fontWeight: "700",
      color: palette.textPrimary,
      letterSpacing: 0.8
    },
    tabButtonTextActive: {
      color: palette.accentText
    },
    errorPanel: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: palette.errorPanel,
      padding: theme.spacing.sm
    },
    errorText: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 12
    },
    callout: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: palette.panel,
      padding: theme.spacing.md,
      gap: theme.spacing.xs
    },
    launchHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.md,
      alignItems: "flex-start"
    },
    launchScore: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 24,
      fontWeight: "700"
    },
    launchTaskList: {
      gap: theme.spacing.sm
    },
    launchTask: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.sm,
      backgroundColor: palette.bg,
      flexDirection: "row",
      gap: theme.spacing.sm,
      alignItems: "flex-start"
    },
    launchTaskStatus: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 11,
      width: 36
    },
    launchTaskCopy: {
      flex: 1,
      gap: 4
    },
    launchTaskTitle: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontWeight: "700",
      fontSize: 12
    },
    launchTaskBody: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12,
      lineHeight: 18
    },
    calloutTitle: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.8
    },
    calloutBody: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12,
      lineHeight: 18
    },
    composer: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.md,
      backgroundColor: palette.panel,
      gap: theme.spacing.sm
    },
    panel: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.md,
      backgroundColor: palette.panel,
      gap: theme.spacing.sm
    },
    sectionTitle: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontWeight: "700",
      fontSize: 12,
      letterSpacing: 0.8
    },
    input: {
      minHeight: 92,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.md,
      backgroundColor: palette.bg,
      fontFamily: "Courier",
      color: palette.textPrimary,
      textAlignVertical: "top"
    },
    singleLineInput: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.md,
      backgroundColor: palette.bg,
      fontFamily: "Courier",
      color: palette.textPrimary
    },
    composerFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm
    },
    counter: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12
    },
    helperText: {
      flex: 1,
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12,
      lineHeight: 18
    },
    postButton: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: palette.accent,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm
    },
    postButtonDisabled: {
      opacity: 0.55
    },
    postButtonText: {
      fontFamily: "Courier",
      fontWeight: "700",
      color: palette.accentText,
      fontSize: 12,
      letterSpacing: 0.8
    },
    feed: {
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.lg
    },
    emptyState: {
      textAlign: "center",
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12,
      lineHeight: 18,
      paddingVertical: theme.spacing.lg
    },
    footer: {
      paddingVertical: theme.spacing.sm,
      alignItems: "center"
    },
    loadMoreButton: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: palette.panel
    },
    loadMoreText: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontWeight: "700",
      fontSize: 12
    },
    caughtUp: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12
    },
    networkPage: {
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.lg
    },
    peerRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: palette.border,
      paddingTop: theme.spacing.sm
    },
    peerCopy: {
      flex: 1,
      gap: theme.spacing.xs
    },
    peerTitleRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      flexWrap: "wrap"
    },
    peerFlag: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 11,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 4,
      paddingVertical: 1
    },
    peerName: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 14,
      fontWeight: "700"
    },
    peerHandle: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12
    },
    peerBio: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 12,
      lineHeight: 18
    },
    peerMeta: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 11
    },
    peerActions: {
      width: 92,
      gap: theme.spacing.xs
    },
    followButton: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.accent,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm
    },
    followButtonDisabled: {
      opacity: 0.6
    },
    followButtonText: {
      fontFamily: "Courier",
      color: palette.accentText,
      fontWeight: "700",
      fontSize: 11
    },
    secondaryActionButton: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.bg,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm
    },
    secondaryActionText: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontWeight: "700",
      fontSize: 11,
      textAlign: "center"
    },
    messagesLayout: {
      flex: 1,
      gap: theme.spacing.sm
    },
    conversationRail: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: palette.panel,
      padding: theme.spacing.sm,
      gap: theme.spacing.sm
    },
    conversationButton: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.sm,
      backgroundColor: palette.bg,
      gap: theme.spacing.xs
    },
    conversationButtonActive: {
      backgroundColor: palette.panel
    },
    conversationTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.sm
    },
    conversationName: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontWeight: "700",
      fontSize: 13
    },
    conversationTime: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 11
    },
    conversationMeta: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 11
    },
    conversationPreview: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 12,
      lineHeight: 18
    },
    unreadBadge: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 11
    },
    threadPanel: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: palette.panel,
      padding: theme.spacing.md,
      gap: theme.spacing.sm
    },
    threadHeader: {
      gap: 2
    },
    threadTitle: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontWeight: "700",
      fontSize: 14
    },
    threadSubtitle: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12
    },
    threadBio: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12,
      lineHeight: 18
    },
    messagesList: {
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.sm
    },
    introPromptPanel: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: palette.bg,
      padding: theme.spacing.sm,
      gap: theme.spacing.xs
    },
    introPromptButton: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.sm
    },
    introPromptText: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontSize: 12,
      lineHeight: 18
    }
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
