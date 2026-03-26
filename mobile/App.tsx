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
import { PostCard } from "./src/components/PostCard";
import { createMeshCore } from "./src/core/meshCore";
import { theme } from "./src/theme";
import { Identity, Post } from "./src/types";

export default function App() {
  const [core] = useState(() => createMeshCore());
  const [composerText, setComposerText] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remainingChars = theme.postCharLimit - composerText.length;
  const canPost =
    composerText.trim().length > 0 && composerText.length <= theme.postCharLimit;

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        setErrorMessage(null);
        await core.bootstrap();
        const nextIdentity = await core.getIdentity();
        const firstPage = await core.getFeedPage(0, theme.pageSize);

        if (!isMounted) {
          return;
        }

        setIdentity(nextIdentity);
        setPosts(firstPage);
        setPage(0);
        setHasMore(firstPage.length === theme.pageSize);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>MESHSOCIAL</Text>
          <Text style={styles.subtitle}>
            {identity
              ? `${identity.handle} on local sqlite, direct peers only`
              : "text-only network, direct peers"}
          </Text>
        </View>

        <View style={styles.composer}>
          <TextInput
            placeholder="Share a short update..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
            style={styles.input}
            maxLength={theme.postCharLimit}
            value={composerText}
            onChangeText={setComposerText}
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
            >
              <Text style={styles.postButtonText}>
                {isPosting ? "POSTING" : "POST"}
              </Text>
            </Pressable>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard post={item} />}
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg
  },
  page: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm
  },
  header: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.panel
  },
  title: {
    fontFamily: "Courier",
    letterSpacing: 1.5,
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  subtitle: {
    marginTop: 4,
    fontFamily: "Courier",
    fontSize: 12,
    color: theme.colors.textMuted
  },
  composer: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.panel,
    gap: theme.spacing.sm
  },
  input: {
    minHeight: 84,
    textAlignVertical: "top",
    fontFamily: "Courier",
    fontSize: 15,
    color: theme.colors.textPrimary
  },
  composerFooter: {
    flexDirection: "row",
    alignItems: "center"
  },
  counter: {
    fontFamily: "Courier",
    color: theme.colors.textMuted,
    fontSize: 12
  },
  postButton: {
    marginLeft: "auto",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs
  },
  postButtonDisabled: {
    opacity: 0.45
  },
  postButtonText: {
    fontFamily: "Courier",
    color: "#ffffff",
    fontWeight: "700",
    letterSpacing: 1
  },
  feed: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg
  },
  errorPanel: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: "#dedede",
    padding: theme.spacing.sm
  },
  errorText: {
    fontFamily: "Courier",
    color: theme.colors.textPrimary,
    fontSize: 12
  },
  emptyState: {
    paddingVertical: theme.spacing.lg,
    textAlign: "center",
    fontFamily: "Courier",
    color: theme.colors.textMuted,
    letterSpacing: 1
  },
  footer: {
    alignItems: "center",
    paddingVertical: theme.spacing.md
  },
  loadMoreButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm
  },
  loadMoreText: {
    fontFamily: "Courier",
    color: theme.colors.textPrimary,
    fontWeight: "700",
    letterSpacing: 0.8
  },
  caughtUp: {
    fontFamily: "Courier",
    color: theme.colors.textMuted,
    fontSize: 12,
    letterSpacing: 1
  }
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "The local backend request failed.";
}
