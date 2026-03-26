import { StyleSheet, Text, View } from "react-native";
import { DirectMessage } from "../types";
import { theme, ThemePalette } from "../theme";

type Props = {
  message: DirectMessage;
  palette: ThemePalette;
};

export function MessageBubble({ message, palette }: Props) {
  const styles = createStyles(palette, message.isLocalAuthor);

  return (
    <View style={styles.row}>
      <View style={styles.bubble}>
        <Text style={styles.body}>{message.body}</Text>
        <Text style={styles.time}>{message.createdAt}</Text>
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette, isLocalAuthor: boolean) {
  return StyleSheet.create({
    row: {
      alignItems: isLocalAuthor ? "flex-end" : "flex-start"
    },
    bubble: {
      maxWidth: "85%",
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: theme.radius.sm,
      backgroundColor: isLocalAuthor ? palette.accent : palette.panel,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.xs
    },
    body: {
      fontFamily: "Courier",
      fontSize: 14,
      lineHeight: 20,
      color: isLocalAuthor ? palette.accentText : palette.textPrimary
    },
    time: {
      fontFamily: "Courier",
      fontSize: 11,
      color: isLocalAuthor ? palette.accentText : palette.textMuted,
      opacity: 0.85
    }
  });
}
