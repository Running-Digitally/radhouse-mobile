import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Action } from '../components/Action';
import { colors, styles } from '../theme';
import { LiveTurn, isWorking, turnStatus } from './transcript';
import { Selection, selectionLabel } from './inference';
import { Reply } from './Reply';

export function Conversation({
  turns,
  text,
  setText,
  pending,
  busy,
  send,
  refresh,
  earlier,
  hasEarlier,
  replyReady,
  notificationRequest,
  returnToCurrent,
  selection,
  openModels,
  modelsAvailable,
  selectionValid,
}: Readonly<{
  turns: readonly LiveTurn[];
  text: string;
  setText: (value: string) => void;
  pending: { id: string; text: string } | null;
  busy: boolean;
  send: () => void;
  refresh: () => void;
  earlier: () => void;
  hasEarlier: boolean;
  replyReady: boolean;
  notificationRequest: string | null;
  returnToCurrent: () => void;
  selection: Selection | null;
  openModels: () => void;
  modelsAvailable: boolean;
  selectionValid: boolean;
}>) {
  const history = useRef<ScrollView>(null),
    following = useRef(true);
  const [away, setAway] = useState(false),
    [searching, setSearching] = useState(false),
    [query, setQuery] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const working = turns.find(isWorking);
  let composerHint = 'Draft kept while you move around the app.';
  if (working) {
    composerHint = 'Your next message will wait for this reply.';
  }
  if (pending) {
    composerHint = 'Message kept. Retry safely without sending it twice.';
  }
  const visible = turns.filter(turn =>
    `${turn.text}\n${turn.output ?? ''}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  function latest() {
    following.current = true;
    setAway(false);
    setQuery('');
    history.current?.scrollToEnd({ animated: false });
  }
  useEffect(() => {
    if (pending) {
      latest();
    }
  }, [pending]);
  function quote(turn: LiveTurn) {
    if (pending) {
      return;
    }
    const excerpt = (turn.output || turn.text)
      .slice(0, 1200)
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');
    const next = `${text}${text ? '\n\n' : ''}${excerpt}\n\n`;
    if (next.length > 16000) {
      setActionNotice(
        'Your draft is full. Shorten it before adding this quote.',
      );
      return;
    }
    setText(next);
    setActionNotice('Excerpt added to your draft.');
  }
  return (
    <View style={styles.grow}>
      <View style={local.toolbar}>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={local.title}>
            Your conversation
          </Text>
          <Text accessibilityLiveRegion="polite" style={styles.small}>
            {working
              ? turnStatus(working.status)
              : 'One conversation, wherever you return'}
          </Text>
        </View>
        <Action
          title={searching ? 'Close search' : 'Search'}
          secondary
          onPress={() => {
            setSearching(!searching);
            setQuery('');
          }}
        />
      </View>
      {searching && (
        <View style={local.search}>
          <TextInput
            accessibilityLabel="Search loaded messages"
            placeholder="Search loaded messages"
            value={query}
            onChangeText={setQuery}
            style={styles.input}
          />
          <Text accessibilityLiveRegion="polite" style={styles.small}>
            {visible.length} matching exchanges · load earlier messages to
            search more
          </Text>
        </View>
      )}
      <ScrollView
        ref={history}
        testID="conversation-history"
        style={styles.grow}
        contentContainerStyle={local.history}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        scrollEventThrottle={16}
        onScroll={({
          nativeEvent: { contentOffset, contentSize, layoutMeasurement },
        }) => {
          following.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            80;
          setAway(!following.current);
        }}
        onLayout={() => {
          if (following.current && !query) {
            history.current?.scrollToEnd({ animated: false });
          }
        }}
        onContentSizeChange={() => {
          if (following.current && !query) {
            history.current?.scrollToEnd({ animated: false });
          }
        }}
      >
        {notificationRequest && (
          <Action
            title="Back to current conversation"
            secondary
            onPress={returnToCurrent}
          />
        )}
        {replyReady && (
          <Text accessibilityLiveRegion="polite" style={styles.small}>
            A Radhouse reply is ready.
          </Text>
        )}
        {hasEarlier && (
          <Action
            title="Load earlier messages"
            secondary
            disabled={busy}
            onPress={() => {
              following.current = false;
              earlier();
            }}
          />
        )}
        {!turns.length && (
          <View style={styles.card}>
            <Text style={local.title}>A place to pick up your thoughts.</Text>
            <Text style={styles.body}>
              Ask a question, work through an idea, or continue something from
              the web.
            </Text>
            <Action
              title="Help me think through an idea"
              secondary
              onPress={() => setText('Help me think through an idea: ')}
            />
          </View>
        )}
        {visible.map(turn => (
          <View key={turn.request_id} style={local.exchange}>
            <View style={local.user}>
              <Text style={styles.eyebrow}>YOU</Text>
              <Text selectable style={styles.body}>
                {turn.text}
              </Text>
            </View>
            <View style={local.answer}>
              <View style={local.byline}>
                <Text style={styles.eyebrow}>RADHOUSE</Text>
                <Text style={styles.small}>{turnStatus(turn.status)}</Text>
              </View>
              {turn.inference && (
                <Text style={styles.small}>
                  {selectionLabel(turn.inference)}
                </Text>
              )}
              {turn.output ? (
                <Reply text={turn.output} />
              ) : (
                <Text style={styles.subtitle}>
                  {isWorking(turn)
                    ? 'You can leave and return while your reply is prepared.'
                    : 'No answer was returned. Your message is saved.'}
                </Text>
              )}
              {turn.output && (
                <View style={local.actions}>
                  <Action
                    title="Quote reply"
                    secondary
                    disabled={Boolean(pending) || text.length > 14000}
                    onPress={() => quote(turn)}
                  />
                  <Action
                    title="Share reply"
                    secondary
                    onPress={() => {
                      Share.share({ message: turn.output ?? '' }).catch(() =>
                        setActionNotice(
                          'Sharing could not be opened. Select the text to copy it.',
                        ),
                      );
                    }}
                  />
                </View>
              )}
            </View>
          </View>
        ))}
        <Action
          title="Refresh conversation"
          secondary
          disabled={busy}
          onPress={refresh}
        />
      </ScrollView>
      {away && (
        <View style={local.latest}>
          <Action
            title={replyReady ? 'New reply · Latest message' : 'Latest message'}
            onPress={latest}
          />
        </View>
      )}
      <View testID="conversation-composer" style={local.composer}>
        {actionNotice ? (
          <Text accessibilityLiveRegion="polite" style={styles.small}>
            {actionNotice}
          </Text>
        ) : null}
        {modelsAvailable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose model and thinking"
            accessibilityValue={{ text: selectionLabel(selection) }}
            disabled={Boolean(pending) || busy}
            onPress={openModels}
            style={local.model}
          >
            <Text style={styles.small}>{selectionLabel(selection)} ▾</Text>
          </Pressable>
        )}
        {!selectionValid && (
          <Text accessibilityRole="alert" style={styles.small}>
            Your selected model is unavailable. Choose another model or Default.
          </Text>
        )}
        <TextInput
          accessibilityLabel="Message Radhouse"
          value={pending?.text ?? text}
          editable={!pending}
          onChangeText={setText}
          multiline
          maxLength={16000}
          style={[styles.input, local.input]}
          placeholder="What’s on your mind?"
        />
        <View style={local.footer}>
          <Text style={[styles.small, styles.grow]}>{composerHint}</Text>
          <Action
            title={pending ? 'Retry same message' : 'Send message'}
            disabled={
              busy || !(pending || text.trim()) || (!pending && !selectionValid)
            }
            onPress={send}
          />
        </View>
      </View>
    </View>
  );
}
const local = StyleSheet.create({
  toolbar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: 21, fontWeight: '600', color: colors.ink },
  search: { paddingHorizontal: 16, gap: 4 },
  history: { padding: 16, gap: 24 },
  exchange: { gap: 18 },
  user: {
    alignSelf: 'flex-end',
    maxWidth: '94%',
    padding: 16,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    backgroundColor: colors.soft,
    gap: 6,
  },
  answer: { gap: 12, paddingHorizontal: 4 },
  byline: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  latest: { alignItems: 'center', padding: 6 },
  composer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
  input: { maxHeight: 140, textAlignVertical: 'top', minHeight: 52 },
  model: { minHeight: 44, justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
