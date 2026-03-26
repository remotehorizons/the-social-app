import { StyleSheet, Text, View } from "react-native";
import { Post } from "../types";
import { theme } from "../theme";

type Props = {
  post: Post;
};

export function PostCard({ post }: Props) {
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.textPrimary,
    fontSize: 14
  },
  handle: {
    fontFamily: "Courier",
    color: theme.colors.textMuted,
    fontSize: 12
  },
  badge: {
    fontFamily: "Courier",
    fontSize: 11,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 4,
    paddingVertical: 1
  },
  time: {
    marginLeft: "auto",
    fontFamily: "Courier",
    color: theme.colors.textMuted,
    fontSize: 12
  },
  body: {
    fontFamily: "Courier",
    color: theme.colors.textPrimary,
    lineHeight: 20,
    fontSize: 14
  }
});
