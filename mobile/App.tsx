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
import { createMeshCore, MeshCore } from "./src/core/meshCore";
import { theme, themes, ColorMode } from "./src/theme";
import { Identity, Post } from "./src/types";

type AppScreenProps = {
  core: MeshCore;
};

export default function App() {
  const [core] = useState(() => createMeshCore());

  return <AppScreen core={core} />;
}

export function AppScreen({ core }: AppScreenProps) {
  const [composerText, setComposerText] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("light");

  const palette = themes[colorMode];
  const styles = createStyles(palette);
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

  const toggleColorMode = () => {
    setColorMode((currentMode) => (currentMode === "light" ? "dark" : "light"));
  };

  return (
    <SafeAreaView style={styles.safe} testID="app-shell">
      <StatusBar style={colorMode === "light" ? "dark" : "light"} />
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
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
        </View>

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

        {errorMessage ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

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
      backgroundColor: palette.panel
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.md
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
    }
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "The local backend request failed.";
}
