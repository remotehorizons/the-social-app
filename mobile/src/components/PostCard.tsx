import { StyleSheet, Text, View } from "react-native";
import { Post } from "../types";
import { theme, ThemePalette } from "../theme";

type Props = {
  post: Post;
  palette: ThemePalette;
};

export function PostCard({ post, palette }: Props) {
  const styles = createStyles(palette);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.displayName}>{post.displayName}</Text>
        <Text style={styles.handle}>{post.authorHandle}</Text>
        {post.isLocalAuthor ? <Text style={styles.badge}>YOU</Text> : null}
        <Text style={styles.time}>{post.createdAt}</Text>
      </View>
      <Text style={styles.body}>{post.body}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: palette.panel,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.md,
      gap: theme.spacing.sm
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm
    },
    displayName: {
      fontFamily: "Courier",
      fontWeight: "700",
      color: palette.textPrimary,
      fontSize: 14
    },
    handle: {
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12
    },
    badge: {
      fontFamily: "Courier",
      fontSize: 11,
      color: palette.textPrimary,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: 4,
      paddingVertical: 1
    },
    time: {
      marginLeft: "auto",
      fontFamily: "Courier",
      color: palette.textMuted,
      fontSize: 12
    },
    body: {
      fontFamily: "Courier",
      color: palette.textPrimary,
      lineHeight: 20,
      fontSize: 14
    }
  });
}
