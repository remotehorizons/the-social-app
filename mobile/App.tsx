import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  SafeAreaView,
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
  ConversationPreview,
  DirectMessage,
  Identity,
  Post
} from "./src/types";

type AppScreenProps = {
  core: MeshCore;
};

type AppTab = "feed" | "messages";

export default function App() {
  const [core] = useState(() => createMeshCore());

  return <AppScreen core={core} />;
}

export function AppScreen({ core }: AppScreenProps) {
  const [activeTab, setActiveTab] = useState<AppTab>("feed");
  const [composerText, setComposerText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [selectedPeerPubkey, setSelectedPeerPubkey] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
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
  const selectedConversation =
    conversations.find((conversation) => conversation.peerPubkey === selectedPeerPubkey) ??
    null;

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        setErrorMessage(null);
        await core.bootstrap();

        const [nextIdentity, firstPage, nextConversations] = await Promise.all([
          core.getIdentity(),
          core.getFeedPage(0, theme.pageSize),
          core.listConversations()
        ]);

        if (!isMounted) {
          return;
        }

        setIdentity(nextIdentity);
        setPosts(firstPage);
        setPage(0);
        setHasMore(firstPage.length === theme.pageSize);
        setConversations(nextConversations);

        const firstConversation = nextConversations[0] ?? null;
        setSelectedPeerPubkey(firstConversation?.peerPubkey ?? null);

        if (firstConversation) {
          setIsLoadingMessages(true);
          const firstMessages = await core.getMessages(firstConversation.peerPubkey);

          if (!isMounted) {
            return;
          }

          setMessages(firstMessages);
          setIsLoadingMessages(false);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
        setIsLoadingMessages(false);
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

  const loadConversation = async (peerPubkey: string) => {
    try {
      setIsLoadingMessages(true);
      setErrorMessage(null);
      setSelectedPeerPubkey(peerPubkey);

      const nextMessages = await core.getMessages(peerPubkey);
      setMessages(nextMessages);
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
      const firstPage = await core.getFeedPage(0, theme.pageSize);

      setComposerText("");
      setPosts(firstPage);
      setPage(0);
      setHasMore(firstPage.length === theme.pageSize);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsPosting(false);
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

      const [nextConversations, nextMessages] = await Promise.all([
        core.listConversations(),
        core.getMessages(selectedPeerPubkey)
      ]);

      setMessageText("");
      setConversations(nextConversations);
      setMessages(nextMessages);
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

          <View style={styles.tabBar}>
            <Pressable
              onPress={() => setActiveTab("feed")}
              style={[
                styles.tabButton,
                activeTab === "feed" && styles.tabButtonActive
              ]}
              testID="feed-tab"
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === "feed" && styles.tabButtonTextActive
                ]}
              >
                FEED
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("messages")}
              style={[
                styles.tabButton,
                activeTab === "messages" && styles.tabButtonActive
              ]}
              testID="messages-tab"
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === "messages" && styles.tabButtonTextActive
                ]}
              >
                MESSAGES
              </Text>
            </Pressable>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {activeTab === "feed" ? (
          <>
            <View style={styles.composer}>
              <TextInput
                placeholder="Share a short update..."
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
                  <Text style={styles.emptyState}>NO POSTS IN YOUR NETWORK YET</Text>
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
        ) : (
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
        )}
      </View>
    </SafeAreaView>
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
    tabBar: {
      flexDirection: "row",
      gap: theme.spacing.sm
    },
    tabButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
      backgroundColor: palette.bg
    },
    tabButtonActive: {
      backgroundColor: palette.accent
    },
    tabButtonText: {
      fontFamily: "Courier",
      fontWeight: "700",
      fontSize: 12,
      letterSpacing: 1,
      color: palette.textPrimary
    },
    tabButtonTextActive: {
      color: palette.accentText
    },
    composer: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.sm,
      backgroundColor: palette.panel,
      gap: theme.spacing.sm
    },
    input: {
      minHeight: 84,
      textAlignVertical: "top",
      fontFamily: "Courier",
      fontSize: 15,
      color: palette.textPrimary
    },
    composerFooter: {
      flexDirection: "row",
      alignItems: "center"
    },
    counter: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12
    },
    postButton: {
      marginLeft: "auto",
      backgroundColor: palette.accent,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs
    },
    postButtonDisabled: {
      opacity: 0.45
    },
    postButtonText: {
      fontFamily: "Courier",
      color: palette.accentText,
      fontWeight: "700",
      letterSpacing: 1
    },
    feed: {
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.lg
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
    emptyState: {
      paddingVertical: theme.spacing.lg,
      textAlign: "center",
      fontFamily: "Courier",
      color: palette.textMuted,
      letterSpacing: 1
    },
    footer: {
      alignItems: "center",
      paddingVertical: theme.spacing.md
    },
    loadMoreButton: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.panel,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.sm
    },
    loadMoreText: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      fontWeight: "700",
      letterSpacing: 0.8
    },
    caughtUp: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12,
      letterSpacing: 1
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
      gap: theme.spacing.xs,
      backgroundColor: palette.bg
    },
    conversationButtonActive: {
      backgroundColor: palette.errorPanel
    },
    conversationTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: theme.spacing.sm
    },
    conversationName: {
      flex: 1,
      fontFamily: "Courier",
      fontSize: 13,
      fontWeight: "700",
      color: palette.textPrimary
    },
    conversationTime: {
      fontFamily: "Courier",
      fontSize: 11,
      color: palette.textMuted
    },
    conversationMeta: {
      fontFamily: "Courier",
      fontSize: 11,
      color: palette.textMuted
    },
    conversationPreview: {
      fontFamily: "Courier",
      fontSize: 12,
      lineHeight: 18,
      color: palette.textPrimary
    },
    unreadBadge: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
      fontFamily: "Courier",
      fontSize: 10,
      fontWeight: "700",
      color: palette.textPrimary
    },
    threadPanel: {
      flex: 1,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: palette.panel,
      padding: theme.spacing.sm,
      gap: theme.spacing.sm
    },
    threadHeader: {
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingBottom: theme.spacing.sm
    },
    threadTitle: {
      fontFamily: "Courier",
      fontSize: 16,
      fontWeight: "700",
      color: palette.textPrimary
    },
    threadSubtitle: {
      marginTop: 2,
      fontFamily: "Courier",
      fontSize: 12,
      color: palette.textMuted
    },
    messagesList: {
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs
    }
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "The local backend request failed.";
}
