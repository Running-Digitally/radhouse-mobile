import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, styles } from '../theme';

type InlineSpan = {
  id: string;
  kind: 'plain' | 'bold' | 'code' | 'link';
  text: string;
  url?: string;
};
type Scan = { end: number; span?: InlineSpan };
function delimitedSpan(
  text: string,
  start: number,
  delimiter: string,
  kind: 'bold' | 'code',
): Scan {
  const content = start + delimiter.length;
  let end = content;
  while (end < text.length && text[end] !== '\n') {
    if (text.startsWith(delimiter, end)) {
      return {
        end: end + delimiter.length,
        span:
          end > content
            ? { id: `${kind}:${start}`, kind, text: text.slice(content, end) }
            : undefined,
      };
    }
    end++;
  }
  return { end };
}
function linkSpan(text: string, start: number): Scan {
  let end = start + 1;
  while (end < text.length && text[end] !== ']' && text[end] !== '\n') {
    end++;
  }
  if (text[end] !== ']') {
    return { end };
  }
  const labelEnd = end,
    urlStart = end + 2;
  if (
    labelEnd === start + 1 ||
    text[end + 1] !== '(' ||
    !(
      text.startsWith('https://', urlStart) ||
      text.startsWith('http://', urlStart)
    )
  ) {
    return { end: end + 1 };
  }
  end = urlStart;
  while (end < text.length && text[end] !== ')' && !/\s/.test(text[end])) {
    end++;
  }
  const schemeLength = text.startsWith('https://', urlStart) ? 8 : 7;
  if (text[end] !== ')' || end === urlStart + schemeLength) {
    return { end };
  }
  return {
    end: end + 1,
    span: {
      id: `link:${start}`,
      kind: 'link',
      text: text.slice(start + 1, labelEnd),
      url: text.slice(urlStart, end),
    },
  };
}
function spanAt(text: string, start: number): Scan | undefined {
  if (text.startsWith('**', start)) {
    return delimitedSpan(text, start, '**', 'bold');
  }
  if (text[start] === '`') {
    return delimitedSpan(text, start, '`', 'code');
  }
  if (text[start] === '[') {
    return linkSpan(text, start);
  }
  return undefined;
}
// A failed construct is consumed once as literal text, never rescanned from
// every nested opener. Each character is visited a bounded number of times,
// including incomplete streamed links and long adversarial bracket runs.
export function inlineSpans(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let cursor = 0,
    plainStart = 0;
  function plain(end: number) {
    if (end > plainStart) {
      spans.push({
        id: `plain:${plainStart}`,
        kind: 'plain',
        text: text.slice(plainStart, end),
      });
    }
  }
  while (cursor < text.length) {
    const candidate = spanAt(text, cursor);
    if (!candidate) {
      cursor++;
      continue;
    }
    if (candidate.span) {
      plain(cursor);
      spans.push(candidate.span);
      plainStart = candidate.end;
    }
    cursor = candidate.end;
  }
  plain(text.length);
  return spans;
}
// Native text only: HTML is never interpreted, images never cause background requests.
function inline(text: string) {
  return inlineSpans(text).map(span => {
    if (span.kind === 'plain') {
      return span.text;
    }
    if (span.kind === 'link') {
      const url = span.url!;
      return (
        <Text
          key={span.id}
          accessibilityRole="link"
          style={local.link}
          onPress={() => {
            Linking.openURL(url).catch(() => undefined);
          }}
        >
          {span.text}
        </Text>
      );
    }
    return (
      <Text
        key={span.id}
        style={span.kind === 'bold' ? local.bold : local.code}
      >
        {span.text}
      </Text>
    );
  });
}
export function replyBlocks(text: string) {
  const blocks: { id: string; code: boolean; text: string }[] = [];
  let code = false,
    lines: string[] = [];
  let offset = 0,
    blockStart = 0;
  function flush() {
    if (lines.length) {
      blocks.push({
        id: `${code ? 'code' : 'prose'}:${blockStart}`,
        code,
        text: lines.join('\n'),
      });
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
      if (!lines.length) {
        blockStart = offset;
      }
      lines.push(line);
    }
    offset += line.length + 1;
  }
  flush();
  return blocks;
}
export function Reply({ text }: Readonly<{ text: string }>) {
  return (
    <View style={local.reply}>
      {replyBlocks(text).map(block => {
        if (block.code) {
          return (
            <ScrollView
              key={block.id}
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
            key={block.id}
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
