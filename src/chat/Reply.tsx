import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, styles } from '../theme';

// Native text only: HTML is never interpreted, images never cause background requests.
function inline(text: string) {
  return text
    .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g)
    .map((part, index) => {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (link) {
        return (
          <Text
            key={index}
            accessibilityRole="link"
            style={local.link}
            onPress={() => {
              Linking.openURL(link[2]).catch(() => undefined);
            }}
          >
            {link[1]}
          </Text>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={index} style={local.bold}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <Text key={index} style={local.code}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      return part;
    });
}
export function replyBlocks(text: string) {
  const blocks: { code: boolean; text: string }[] = [];
  let code = false,
    lines: string[] = [];
  function flush() {
    if (lines.length) {
      blocks.push({ code, text: lines.join('\n') });
      lines = [];
    }
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      flush();
      code = !code;
    } else if (!code && !line.trim()) {
      flush();
    } else {
      lines.push(line);
    }
  }
  flush();
  return blocks;
}
export function Reply({ text }: Readonly<{ text: string }>) {
  return (
    <View style={local.reply}>
      {replyBlocks(text).map((block, index) => {
        if (block.code) {
          return (
            <ScrollView
              key={index}
              horizontal
              accessibilityLabel="Code block"
              style={local.codeBlock}
            >
              <Text selectable style={[styles.body, local.code]}>
                {block.text}
              </Text>
            </ScrollView>
          );
        }
        const heading = /^#{1,6}\s+/.test(block.text);
        return (
          <Text
            key={index}
            selectable
            accessibilityRole={heading ? 'header' : undefined}
            style={[styles.body, heading && local.heading]}
          >
            {inline(
              block.text.replace(/^#{1,6}\s+/, '').replace(/^[-*] /gm, '• '),
            )}
          </Text>
        );
      })}
    </View>
  );
}
const local = StyleSheet.create({
  reply: { gap: 12 },
  bold: { fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700' },
  link: { color: colors.ink, textDecorationLine: 'underline' },
  code: { fontFamily: 'monospace' },
  codeBlock: { backgroundColor: colors.soft, borderRadius: 10, padding: 12 },
});
