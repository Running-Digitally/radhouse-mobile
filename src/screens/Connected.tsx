import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SessionClient } from '../auth/client';
import { SessionError, SessionInfo } from '../auth/types';
import {
  NotificationConnection,
  NotificationState,
} from '../notifications/connection';
import { ORIGIN, object } from '../auth/transfer';
import { TabBar } from '../components/TabBar';
import { LiveViewer } from '../components/LiveViewer';
import { Action } from '../components/Action';
import { colors, styles } from '../theme';
import { Destination } from '../workspace';

type LiveTurn = {
  request_id: string;
  text: string;
  output: string | null;
  status: string;
};
type LiveFile = { id: string; name: string; kind: string };
export function readTurns(value: unknown): LiveTurn[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new SessionError('invalid');
  }
  return value.map(item => {
    const turn = object(item);
    if (
      typeof turn.request_id !== 'string' ||
      typeof turn.text !== 'string' ||
      typeof turn.status !== 'string' ||
      !(turn.output === null || typeof turn.output === 'string')
    ) {
      throw new SessionError('invalid');
    }
    return {
      request_id: turn.request_id,
      text: turn.text,
      status: turn.status,
      output: turn.output,
    };
  });
}
function readFiles(value: unknown): LiveFile[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new SessionError('invalid');
  }
  return value.map(item => {
    const file = object(item);
    if (
      typeof file.id !== 'string' ||
      typeof file.name !== 'string' ||
      typeof file.kind !== 'string'
    ) {
      throw new SessionError('invalid');
    }
    return { id: file.id, name: file.name, kind: file.kind };
  });
}
function failure(error: unknown): string {
  if (error instanceof SessionError && error.kind === 'credentials') {
    return 'Check your username, password and current six-digit code.';
  }
  if (error instanceof SessionError && error.kind === 'pending') {
    return 'Browser sign-in timed out. Start again when you are ready.';
  }
  return 'Connection could not be confirmed. Retry when you are connected.';
}

export function Connected({
  client,
  leave,
  notifications,
}: Readonly<{
  client: SessionClient;
  leave: () => void;
  notifications?: NotificationConnection;
}>) {
  const [step, setStep] = useState<
    'restore' | 'access' | 'local' | 'workspace'
  >('restore');
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [destination, setDestination] = useState<Destination>('Chat');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [files, setFiles] = useState<LiveFile[]>([]);
  const [pending, setPending] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notificationState, setNotificationState] =
    useState<NotificationState>('unavailable');
  const [notificationRequest, setNotificationRequest] = useState<string | null>(
    null,
  );
  const [replyReady, setReplyReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const busyRef = useRef(false);
  const pollingRef = useRef(false);
  const refreshVersion = useRef(0);
  const conversation = useRef<ScrollView>(null);
  const followingLatest = useRef(true);
  const generation = useRef(0);
  const activeRef = useRef(active);

  const run = useCallback(
    async (action: () => Promise<void>, quiet = false) => {
      if (busyRef.current || (quiet && pollingRef.current)) {
        return;
      }
      const epoch = generation.current;
      if (quiet) {
        pollingRef.current = true;
      } else {
        // An explicit action takes priority over an older background read.
        refreshVersion.current++;
        busyRef.current = true;
        setBusy(true);
        setError('');
      }
      try {
        await action();
      } catch (caught) {
        if (epoch === generation.current) {
          setError(failure(caught));
          if (caught instanceof SessionError && caught.kind === 'expired') {
            setInfo(null);
            setTurns([]);
            setFiles([]);
            setPending(null);
            setNotificationRequest(null);
            setReplyReady(false);
            setText('');
            setStep('access');
            await notifications?.disable().catch(() => undefined);
            await client.logout().catch(() => undefined);
          }
        }
      } finally {
        if (epoch === generation.current) {
          if (quiet) {
            pollingRef.current = false;
          } else {
            busyRef.current = false;
            setBusy(false);
          }
        }
      }
    },
    [client, notifications],
  );
  const restore = useCallback(
    async (epoch: number) => {
      const session = await client.restore();
      if (epoch !== generation.current) {
        return;
      }
      setInfo(session);
      setStep(session ? 'workspace' : 'access');
      setVerified(Boolean(session));
    },
    [client],
  );
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const epoch = generation.current;
    run(() => restore(epoch));
    const listener = AppState.addEventListener('change', state => {
      const foreground = state === 'active';
      activeRef.current = foreground;
      setActive(foreground);
      if (!foreground) {
        setVerified(false);
      }
    });
    return () => {
      invalidate();
      listener.remove();
    };
  }, [run, restore, invalidate]);

  useEffect(() => {
    if (step !== 'workspace' || !info?.username || !notifications) {
      return;
    }
    let attached = true;
    notifications
      .connect(info.username, {
        state: value => {
          if (attached) {
            setNotificationState(value);
          }
        },
        foreground: () => {
          if (attached) {
            setReplyReady(true);
          }
        },
        open: id => {
          if (!attached) {
            return;
          }
          setNotificationRequest(id);
          setDestination('Chat');
        },
      })
      .catch(() => {
        if (attached) {
          setNotificationState('error');
        }
      });
    return () => {
      attached = false;
      notifications.disconnect();
    };
  }, [step, info?.username, notifications]);

  const refresh = useCallback(async () => {
    const epoch = generation.current;
    const version = ++refreshVersion.current;
    const result = await client.read(
      destination === 'Library'
        ? '/chat/library'
        : notificationRequest
        ? '/chat/messages/' + notificationRequest
        : '/chat/reply',
    );
    if (epoch !== generation.current || version !== refreshVersion.current) {
      return;
    }
    if (destination === 'Library') {
      setFiles(readFiles(result.files));
    } else {
      setTurns(readTurns(notificationRequest ? [result.turn] : result.turns));
    }
  }, [client, destination, notificationRequest]);
  const revalidate = useCallback(async () => {
    const epoch = generation.current;
    const result = await client.read('/auth/session');
    if (epoch !== generation.current) {
      return;
    }
    if (!result.username) {
      throw new SessionError('invalid');
    }
    if (activeRef.current) {
      setVerified(true);
    }
    if (destination === 'Chat' || destination === 'Library') {
      await refresh();
    }
  }, [client, destination, refresh]);
  useEffect(() => {
    if (step !== 'workspace' || !active) {
      return;
    }
    run(revalidate);
    const timer = setInterval(() => {
      if (activeRef.current && destination === 'Chat') {
        run(refresh, true);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [step, active, destination, run, refresh, revalidate]);

  async function signOut() {
    generation.current++;
    busyRef.current = false;
    pollingRef.current = false;
    setBusy(false);
    setInfo(null);
    setTurns([]);
    setFiles([]);
    setText('');
    setPending(null);
    setNotificationRequest(null);
    setReplyReady(false);
    setPassword('');
    setCode('');
    setStep('access');
    try {
      // Server session revocation remains authoritative if device cleanup fails.
      await notifications?.disable().catch(() => undefined);
      await client.logout();
      leave();
    } catch {
      setError(
        'Signed out on this device. Server revocation could not be confirmed.',
      );
    }
  }
  async function signIn() {
    const epoch = generation.current;
    const submittedPassword = password;
    const submittedCode = code;
    setPassword('');
    setCode('');
    const session = await client.localLogin(
      username,
      submittedPassword,
      submittedCode,
    );
    if (epoch === generation.current) {
      setVerified(true);
      setInfo(session);
      setStep('workspace');
    }
  }
  async function send() {
    const epoch = generation.current;
    const frozen = pending ?? {
      id: await client.newRequestId(),
      text: text.trim(),
    };
    if (epoch !== generation.current) {
      return;
    }
    setPending(frozen);
    followingLatest.current = true;
    // Every explicit retry uses the same request ID and frozen text. Never auto-resubmit.
    await client.send(frozen.id, frozen.text);
    if (epoch !== generation.current) {
      return;
    }
    setPending(null);
    setText('');
    await refresh();
  }
  if (step === 'workspace' && active && !verified) {
    return (
      <View style={styles.page}>
        <Text style={styles.subtitle}>Checking your connection…</Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.body}>
            {error}
          </Text>
        ) : null}
        <Action
          title="Reconnect workspace"
          disabled={busy}
          onPress={() => run(revalidate)}
        />
        <Action title="Sign out" secondary onPress={signOut} />
      </View>
    );
  }
  if (!active) {
    return (
      <View style={styles.page}>
        <Text style={styles.title}>Radhouse</Text>
        <Text style={styles.subtitle}>
          Your workspace is private while the app is in the background.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.grow}>
      <View
        style={
          step === 'workspace' && !error && !busy ? undefined : styles.page
        }
      >
        {error ? (
          <Text accessibilityRole="alert" style={styles.body}>
            {error}
          </Text>
        ) : null}
        {busy ? <Text style={styles.small}>Connecting…</Text> : null}
        {step === 'restore' && (
          <Action
            title="Retry saved sign-in"
            disabled={busy}
            onPress={() => run(() => restore(generation.current))}
          />
        )}
        {step === 'access' && (
          <>
            <Text style={styles.title}>Your Radhouse, connected.</Text>
            <Text style={styles.subtitle}>
              Sign in through Access in your browser, then return here.
            </Text>
            <Action
              title="Sign in with Access"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const epoch = generation.current;
                  await client.accessLogin();
                  if (epoch === generation.current) {
                    setStep('local');
                  }
                })
              }
            />
          </>
        )}
        {step === 'local' && (
          <>
            <Text style={styles.title}>Welcome back.</Text>
            <TextInput
              accessibilityLabel="Radhouse username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Radhouse password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Authentication code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={6}
              style={styles.input}
            />
            <Action
              title="Open my workspace"
              disabled={busy || !username || !password || code.length !== 6}
              onPress={() => run(signIn)}
            />
          </>
        )}
        {step !== 'workspace' && (
          <Action title="Cancel sign-in" secondary onPress={signOut} />
        )}
      </View>
      {step === 'workspace' &&
        (destination === 'Browser' || destination === 'Terminal') &&
        (info?.features[
          destination === 'Browser' ? 'browser_streaming' : 'terminal'
        ] ? (
          <LiveViewer
            origin={ORIGIN}
            destination={destination}
            authenticated
            foreground={active}
          />
        ) : (
          <Text style={styles.subtitle}>
            This feature is unavailable on your server.
          </Text>
        ))}
      {step === 'workspace' && destination === 'Chat' && (
        <View style={styles.grow}>
          <ScrollView
            ref={conversation}
            testID="conversation-history"
            style={styles.grow}
            contentContainerStyle={styles.page}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                nativeEvent;
              followingLatest.current =
                contentSize.height -
                  contentOffset.y -
                  layoutMeasurement.height <
                80;
            }}
            onLayout={() => {
              if (followingLatest.current) {
                conversation.current?.scrollToEnd({ animated: false });
              }
            }}
            onContentSizeChange={() => {
              if (followingLatest.current) {
                conversation.current?.scrollToEnd({ animated: false });
              }
            }}
          >
            <Text style={styles.title}>Your conversation.</Text>
            {replyReady && (
              <Text style={styles.small}>A Radhouse reply is ready.</Text>
            )}
            {notificationRequest && (
              <Action
                title="Back to current conversation"
                secondary
                onPress={() => {
                  setNotificationRequest(null);
                  setReplyReady(false);
                }}
              />
            )}
            {turns.map(turn => (
              <View key={turn.request_id} style={styles.card}>
                <Text style={styles.eyebrow}>YOU</Text>
                <Text style={styles.body}>{turn.text}</Text>
                <Text style={styles.small}>{turn.status}</Text>
                {turn.output ? (
                  <Text selectable style={styles.body}>
                    {turn.output}
                  </Text>
                ) : null}
              </View>
            ))}
            <Action
              title="Refresh conversation"
              secondary
              disabled={busy}
              onPress={() => run(refresh)}
            />
          </ScrollView>
          <View testID="conversation-composer" style={chatStyles.composer}>
            <View style={styles.row}>
              <TextInput
                accessibilityLabel="Message Radhouse"
                value={pending?.text ?? text}
                editable={!pending}
                onChangeText={setText}
                multiline
                maxLength={16000}
                style={[styles.input, chatStyles.input]}
                placeholder="What’s on your mind?"
              />
              <Action
                title={pending ? 'Retry same message' : 'Send message'}
                disabled={busy || !(pending || text.trim())}
                onPress={() => run(send)}
              />
            </View>
            {pending && (
              <Text style={styles.small}>
                Submission is unconfirmed. Retry sends the same message
                identifier, so a lost response cannot create a second message.
              </Text>
            )}
          </View>
        </View>
      )}
      {step === 'workspace' && destination === 'Library' && (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.title}>Your Library.</Text>
          {files.map(file => (
            <View key={file.id} style={styles.card}>
              <Text style={styles.body}>{file.name}</Text>
              <Text style={styles.small}>{file.kind}</Text>
            </View>
          ))}
          <Action
            title="Refresh files"
            disabled={busy}
            onPress={() => run(refresh)}
          />
          <Text style={styles.small}>
            File opening and uploads are still being connected.
          </Text>
        </ScrollView>
      )}
      {step === 'workspace' && destination === 'Settings' && (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.title}>Your connection.</Text>
          <Text style={styles.body}>Signed in as {info?.username}</Text>
          <Text style={styles.subtitle}>
            {notificationState === 'on'
              ? 'Reply notifications are enabled on this device.'
              : notificationState === 'unavailable'
              ? 'Reply notifications are not available on this connection yet.'
              : notificationState === 'error'
              ? 'Notification setup could not be confirmed. Retry when connected.'
              : 'Get a private notification when your reply is ready.'}
          </Text>
          {notifications && notificationState !== 'unavailable' && (
            <Action
              title={
                notificationState === 'on'
                  ? 'Turn off reply notifications'
                  : 'Enable reply notifications'
              }
              disabled={notificationState === 'loading'}
              onPress={() => {
                const action =
                  notificationState === 'on'
                    ? notifications.disable()
                    : notifications.enable();
                action.catch(() => setNotificationState('error'));
              }}
            />
          )}
          {notifications && notificationState === 'error' && (
            <Action
              title="Turn off reply notifications"
              secondary
              onPress={() => {
                notifications
                  .disable()
                  .catch(() => setNotificationState('error'));
              }}
            />
          )}
          <Action title="Sign out" secondary onPress={signOut} />
        </ScrollView>
      )}
      {step === 'workspace' && (
        <TabBar
          destination={destination}
          select={setDestination}
          disabled={busy}
        />
      )}
    </View>
  );
}

const chatStyles = StyleSheet.create({
  composer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
  input: { flex: 1, maxHeight: 120, textAlignVertical: 'top' },
});
