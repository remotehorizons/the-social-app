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
  unreadCount: 0
};

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
  const [busyPeerPubkey, setBusyPeerPubkey] = useState<string | null>(null);
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
  const onboardingReady =
    stats.followingCount >= 2 && stats.localPostCount >= 1 && stats.conversationCount >= 1;

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
    if (peer.isSelf || busyPeerPubkey) {
      return;
    }

    try {
      setBusyPeerPubkey(peer.pubkey);
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
      setBusyPeerPubkey(null);
    }
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

  const networkSuggestions = peers.filter((peer) => !peer.isSelf && !peer.isFollowing);

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
            {!onboardingReady ? (
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>FIRST SESSION CHECKLIST</Text>
                <Text style={styles.calloutBody}>
                  Follow at least two people, publish one short update, and send one direct
                  message. That is the minimum loop that makes a social product sticky.
                </Text>
              </View>
            ) : null}

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
                Successful calm social products win on trust, not infinite reach. The loop
                here is simple: identity, relevant follows, useful posts, and fast replies.
              </Text>
            </View>

            {networkSuggestions.length > 0 ? (
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>SUGGESTED CONNECTIONS</Text>
                {networkSuggestions.map((peer) => (
                  <PeerRow
                    key={peer.pubkey}
                    peer={peer}
                    palette={palette}
                    busy={busyPeerPubkey === peer.pubkey}
                    onPress={() => void toggleFollow(peer)}
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
                  busy={busyPeerPubkey === peer.pubkey}
                  onPress={() => void toggleFollow(peer)}
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

            {selectedConversation ? (
              <View style={styles.threadPanel}>
                <View style={styles.threadHeader}>
                  <Text style={styles.threadTitle}>
                    {selectedConversation.peerDisplayName}
                  </Text>
                  <Text style={styles.threadSubtitle}>
                    {selectedConversation.peerHandle}
                  </Text>
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
                      <Text style={styles.emptyState}>NO MESSAGES IN THIS THREAD</Text>
                    )
                  }
                />

                <View style={styles.composer}>
                  <Text style={styles.sectionTitle}>REPLY FAST</Text>
                  <TextInput
                    placeholder={`Message ${selectedConversation.peerHandle}...`}
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
                      disabled={!canSendMessage || isSendingMessage}
                      style={({ pressed }) => [
                        styles.postButton,
                        (!canSendMessage || isSendingMessage || pressed) &&
                          styles.postButtonDisabled
                      ]}
                      testID="send-message-button"
                    >
                      <Text style={styles.postButtonText}>
                        {isSendingMessage ? "SENDING" : "SEND"}
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

  const nextSelectedPeerPubkey = chooseSelectedPeer(conversations, selectedPeerPubkey ?? null);
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

function chooseSelectedPeer(
  conversations: ConversationPreview[],
  selectedPeerPubkey: string | null
) {
  if (
    selectedPeerPubkey &&
    conversations.some((conversation) => conversation.peerPubkey === selectedPeerPubkey)
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
  busy,
  onPress
}: {
  peer: NetworkPeer;
  palette: (typeof themes)[ColorMode];
  busy: boolean;
  onPress: () => void;
}) {
  const styles = createStyles(palette);

  return (
    <View style={styles.peerRow}>
      <View style={styles.peerCopy}>
        <View style={styles.peerTitleRow}>
          <Text style={styles.peerName}>{peer.displayName}</Text>
          <Text style={styles.peerHandle}>{peer.handle}</Text>
        </View>
        <Text style={styles.peerBio}>{peer.bio || "No profile bio yet."}</Text>
        <Text style={styles.peerMeta}>
          {peer.postCount} posts
          {peer.lastPostAt ? ` • last post ${peer.lastPostAt}` : ""}
        </Text>
      </View>
      <Pressable
        disabled={peer.isSelf || busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.followButton,
          (peer.isSelf || busy || pressed) && styles.followButtonDisabled
        ]}
        testID={`follow-toggle-${peer.pubkey}`}
      >
        <Text style={styles.followButtonText}>
          {peer.isSelf ? "YOU" : busy ? "..." : peer.isFollowing ? "UNFOLLOW" : "FOLLOW"}
        </Text>
      </Pressable>
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
    messagesList: {
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.sm
    }
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
