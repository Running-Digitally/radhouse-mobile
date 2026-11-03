import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Keyboard,
  ScrollView,
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
import { Commitments } from '../components/Commitments';
import { styles } from '../theme';
import { Conversation } from '../chat/Conversation';
import { ModelPicker } from '../chat/ModelPicker';
import {
  Catalog,
  Selection,
  readCatalog,
  selectionAvailable,
} from '../chat/inference';
import { LiveTurn, readTurns, mergeTurns, isWorking } from '../chat/transcript';
export { readTurns } from '../chat/transcript';
import { Destination } from '../workspace';

type LiveFile = { id: string; name: string; kind: string };
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
  if (error instanceof SessionError && error.admissionRejected) {
    return 'The model settings were not accepted. Your draft is restored. Choose another model or Default and send again.';
  }
  if (error instanceof SessionError && error.kind === 'credentials') {
    return 'Check your username, password and current six-digit code.';
  }
  if (error instanceof SessionError && error.kind === 'pending') {
    return 'Browser sign-in timed out. Start again when you are ready.';
  }
  if (error instanceof SessionError && error.kind === 'conflict') {
    return 'Radhouse reported a workspace conflict. Your message is kept for retry.';
  }
  return 'Connection could not be confirmed. Retry when you are connected.';
}

const notificationDescriptions: Record<NotificationState, string> = {
  on: 'Reply notifications are enabled on this device.',
  unavailable: 'Reply notifications are not available on this connection yet.',
  error: 'Notification setup could not be confirmed. Retry when connected.',
  loading: 'Get a private notification when your reply is ready.',
  off: 'Get a private notification when your reply is ready.',
};
function refreshPath(destination: Destination, request: string | null) {
  if (destination === 'Library') {
    return '/chat/library';
  }
  return request ? '/chat/messages/' + request : '/chat/reply';
}
function WorkspaceViewer({
  destination,
  info,
  active,
}: Readonly<{
  destination: Destination;
  info: SessionInfo | null;
  active: boolean;
}>) {
  if (destination !== 'Browser' && destination !== 'Terminal') {
    return null;
  }
  const feature = destination === 'Browser' ? 'browser_streaming' : 'terminal';
  if (!info?.features[feature]) {
    return (
      <Text style={styles.subtitle}>
        This feature is unavailable on your server.
      </Text>
    );
  }
  return (
    <LiveViewer
      origin={ORIGIN}
      destination={destination}
      authenticated
      foreground={active}
    />
  );
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
  const [pending, setPending] = useState<{
    id: string;
    text: string;
    inference: Selection | null;
  } | null>(null);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notificationState, setNotificationState] =
    useState<NotificationState>('unavailable');
  const [notificationRequest, setNotificationRequest] = useState<string | null>(
    null,
  );
  const [replyReady, setReplyReady] = useState(false);
  const [suggestionReady, setSuggestionReady] = useState(false);
  const [commitmentsOpen, setCommitmentsOpen] = useState(false);
  const [commitmentFocus, setCommitmentFocus] = useState<string | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const busyRef = useRef(false);
  const pollingRef = useRef(false);
  const refreshVersion = useRef(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [olderBefore, setOlderBefore] = useState<number | null>(null);
  const modelVersion = useRef(0);
  const historyInitialized = useRef(false);
  const latestWindow = useRef<LiveTurn[]>([]);
  const retainedTurns = useRef<LiveTurn[]>([]);
  const activeRefreshOffset = useRef(0);
  const generation = useRef(0);
  const activeRef = useRef(active);
  const signingOut = useRef(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    retainedTurns.current = turns;
  }, [turns]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const expireSession = useCallback(async () => {
    generation.current++;
    refreshVersion.current++;
    busyRef.current = false;
    pollingRef.current = false;
    setBusy(false);
    setVerified(false);
    setInfo(null);
    setTurns([]);
    retainedTurns.current = [];
    setFiles([]);
    setPending(null);
    setNotificationRequest(null);
    setReplyReady(false);
    setText('');
    setSelection(null);
    setCatalog(null);
    setModelsOpen(false);
    setModelsLoading(false);
    setOlderBefore(null);
    historyInitialized.current = false;
    latestWindow.current = [];
    modelVersion.current++;
    setStep('access');
    await Promise.all([
      client.logout().catch(() => undefined),
      notifications?.disable().catch(() => undefined),
    ]);
  }, [client, notifications]);
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
      } catch (error_) {
        if (epoch === generation.current) {
          setError(failure(error_));
          if (error_ instanceof SessionError && error_.kind === 'expired') {
            await expireSession();
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
    [expireSession],
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
        foregroundCommitment: () => {
          if (attached) setSuggestionReady(true);
        },
        open: id => {
          if (!attached) {
            return;
          }
          setNotificationRequest(id);
          setCommitmentsOpen(false);
          setDestination('Chat');
        },
        openCommitment: id => {
          if (!attached) return;
          setSuggestionReady(false);
          setCommitmentFocus(id);
          setCommitmentsOpen(true);
          setNotificationRequest(null);
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

  const receiveLatest = useCallback(
    (result: Record<string, unknown>, refreshed: LiveTurn[] = []) => {
      const incoming = readTurns(result.turns);
      const prior = latestWindow.current;
      const ids = new Set(prior.map(turn => turn.request_id));
      // A bounded latest page can skip past the entire previous page while this
      // device is away. Restart pagination rather than preserve an invisible gap
      // or a stale running turn that no later poll can update.
      const advancedPastWindow =
        historyInitialized.current &&
        prior.length > 0 &&
        incoming.length > 0 &&
        !incoming.some(turn => ids.has(turn.request_id)) &&
        Math.max(...incoming.map(turn => turn.seq ?? 0)) >
          Math.max(...prior.map(turn => turn.seq ?? 0));
      latestWindow.current = incoming;
      setTurns(previous =>
        advancedPastWindow
          ? incoming
          : mergeTurns(previous, [...incoming, ...refreshed]),
      );
      if (!historyInitialized.current || advancedPastWindow) {
        historyInitialized.current = true;
        setOlderBefore(
          typeof result.older_before === 'number' ? result.older_before : null,
        );
      }
      return incoming;
    },
    [],
  );
  const refresh = useCallback(async () => {
    const epoch = generation.current;
    const version = ++refreshVersion.current;
    const result = await client.read(
      refreshPath(destination, notificationRequest),
    );
    let refreshed: LiveTurn[] = [];
    if (destination === 'Chat' && !notificationRequest) {
      const currentIds = new Set(
        readTurns(result.turns).map(turn => turn.request_id),
      );
      const overlaps = latestWindow.current.some(turn =>
        currentIds.has(turn.request_id),
      );
      const outside = overlaps
        ? retainedTurns.current.filter(
            turn => isWorking(turn) && !currentIds.has(turn.request_id),
          )
        : [];
      // Older pages can contain active turns too. Bound each poll's extra reads,
      // rotating through a large queue so no retained active row is stranded.
      const start = outside.length
        ? activeRefreshOffset.current % outside.length
        : 0;
      const batch = [...outside.slice(start), ...outside.slice(0, start)].slice(
        0,
        10,
      );
      activeRefreshOffset.current = start + batch.length;
      const receipts = await Promise.all(
        batch.map(turn => client.read('/chat/messages/' + turn.request_id)),
      );
      refreshed = receipts.flatMap(receipt => readTurns([receipt.turn]));
    }
    if (epoch !== generation.current || version !== refreshVersion.current) {
      return;
    }
    if (destination === 'Library') {
      setFiles(readFiles(result.files));
    } else {
      const incoming = notificationRequest
        ? readTurns([result.turn])
        : receiveLatest(result, refreshed);
      if (notificationRequest) {
        setTurns(incoming);
      }
      setPending(previous =>
        previous && incoming.some(turn => turn.request_id === previous.id)
          ? null
          : previous,
      );
    }
  }, [client, destination, notificationRequest, receiveLatest]);
  const loadModels = useCallback(
    async (force = false) => {
      const epoch = generation.current,
        version = ++modelVersion.current;
      setModelsLoading(true);
      try {
        const value = await client.read(
          '/chat/inference' + (force ? '?refresh=true' : ''),
        );
        if (epoch === generation.current && version === modelVersion.current) {
          setCatalog(readCatalog(value));
          setModelError('');
        }
      } catch (catalogError) {
        if (epoch === generation.current && version === modelVersion.current) {
          if (
            catalogError instanceof SessionError &&
            catalogError.kind === 'expired'
          ) {
            setError(failure(catalogError));
            await expireSession();
          } else {
            setCatalog(null);
            setModelError('Models could not be checked. Retry or use Default.');
          }
        }
      } finally {
        if (epoch === generation.current && version === modelVersion.current) {
          setModelsLoading(false);
        }
      }
    },
    [client, expireSession],
  );
  useEffect(() => {
    if (
      step === 'workspace' &&
      active &&
      verified &&
      info?.features.inference
    ) {
      loadModels();
    }
  }, [step, active, verified, info?.features.inference, loadModels]);
  async function earlier() {
    if (!olderBefore) {
      return;
    }
    const epoch = generation.current;
    const result = await client.read('/chat/history?before=' + olderBefore);
    if (epoch !== generation.current) {
      return;
    }
    setTurns(previous => mergeTurns(previous, readTurns(result.turns)));
    setOlderBefore(
      typeof result.older_before === 'number' ? result.older_before : null,
    );
  }
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
    if (signingOut.current) {
      return;
    }
    signingOut.current = true;
    generation.current++;
    busyRef.current = true;
    pollingRef.current = false;
    setBusy(true);
    setInfo(null);
    setTurns([]);
    retainedTurns.current = [];
    setFiles([]);
    setText('');
    setPending(null);
    setSelection(null);
    setCatalog(null);
    setModelsOpen(false);
    setOlderBefore(null);
    historyInitialized.current = false;
    latestWindow.current = [];
    setNotificationRequest(null);
    setCommitmentsOpen(false);
    setCommitmentFocus(null);
    setSuggestionReady(false);
    setReplyReady(false);
    setPassword('');
    setCode('');
    setStep('access');
    try {
      // Server session revocation remains authoritative if device cleanup fails.
      await Promise.all([
        client.logout(),
        notifications?.disable().catch(() => undefined),
      ]);
      leave();
    } catch {
      setError(
        'Signed out on this device. Server revocation could not be confirmed.',
      );
    } finally {
      signingOut.current = false;
      busyRef.current = false;
      setBusy(false);
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
      inference: selection ? { ...selection } : null,
    };
    if (epoch !== generation.current) {
      return;
    }
    setPending(frozen);
    setText('');
    // Every explicit retry uses the same request ID and frozen text. Never auto-resubmit.
    let receipt;
    try {
      receipt = frozen.inference
        ? await client.send(frozen.id, frozen.text, frozen.inference)
        : await client.send(frozen.id, frozen.text);
    } catch (sendError) {
      if (
        epoch === generation.current &&
        sendError instanceof SessionError &&
        sendError.admissionRejected
      ) {
        setPending(null);
        setText(frozen.text);
      }
      throw sendError;
    }
    if (epoch !== generation.current) {
      return;
    }
    setPending(null);
    if (Array.isArray(receipt.turns)) {
      setTurns(previous => mergeTurns(previous, readTurns(receipt.turns)));
    }
    setText('');
    if (notificationRequest) {
      historyInitialized.current = false;
      latestWindow.current = [];
      setOlderBefore(null);
      setNotificationRequest(null);
      setReplyReady(false);
    }
    const version = ++refreshVersion.current;
    const result = await client.read('/chat/reply');
    if (epoch === generation.current && version === refreshVersion.current) {
      receiveLatest(result);
    }
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
      {step === 'workspace' && (
        <WorkspaceViewer
          destination={destination}
          info={info}
          active={active}
        />
      )}
      {step === 'workspace' && suggestionReady && (
        <Action
          title="Review a new Radhouse suggestion"
          secondary
          onPress={() => {
            setSuggestionReady(false);
            setCommitmentFocus(null);
            setCommitmentsOpen(true);
            setDestination('Chat');
          }}
        />
      )}
      {step === 'workspace' && destination === 'Chat' && commitmentsOpen && (
        <ScrollView contentContainerStyle={styles.page}>
          <Commitments
            client={client}
            focusId={commitmentFocus}
            onClose={() => setCommitmentsOpen(false)}
            onSource={id => {
              setCommitmentsOpen(false);
              setNotificationRequest(id);
            }}
          />
        </ScrollView>
      )}
      {step === 'workspace' && destination === 'Chat' && !commitmentsOpen && (
        <>
          <Conversation
            turns={turns}
            text={text}
            setText={setText}
            pending={pending}
            busy={busy}
            send={() => run(send)}
            refresh={() => run(refresh)}
            earlier={() => run(earlier)}
            hasEarlier={Boolean(olderBefore) && !notificationRequest}
            replyReady={replyReady}
            notificationRequest={notificationRequest}
            returnToCurrent={() => {
              historyInitialized.current = false;
              latestWindow.current = [];
              setOlderBefore(null);
              setNotificationRequest(null);
              setReplyReady(false);
              setTurns([]);
            }}
            selection={selection}
            openModels={() => {
              Keyboard.dismiss();
              setModelsOpen(true);
            }}
            modelsAvailable={Boolean(info?.features.inference)}
            selectionValid={selectionAvailable(catalog, selection)}
          />
          <ModelPicker
            visible={modelsOpen}
            close={() => setModelsOpen(false)}
            catalog={catalog}
            selection={selection}
            select={setSelection}
            refresh={() => loadModels(true)}
            loading={modelsLoading}
            error={modelError}
          />
        </>
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
          <Action
            title="Responsibilities"
            secondary
            onPress={() => {
              setCommitmentFocus(null);
              setCommitmentsOpen(true);
              setDestination('Chat');
            }}
          />
          <Text style={styles.subtitle}>
            {notificationState === 'error' && notifications
              ? notifications.failureDescription()
              : notificationDescriptions[notificationState]}
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
          {notifications && notificationState === 'on' && (
            <>
              <Text style={styles.small}>
                Agent suggestions have separate notification consent. Quiet
                hours and the responsibility's scope still apply.
              </Text>
              <Action
                title={
                  notifications.commitmentNotificationsEnabled()
                    ? 'Turn off agent suggestion notifications'
                    : 'Notify me about agent suggestions'
                }
                secondary
                onPress={() =>
                  notifications
                    .setCommitmentNotifications(
                      !notifications.commitmentNotificationsEnabled(),
                    )
                    .catch(() => setNotificationState('error'))
                }
              />
            </>
          )}
          <Action title="Sign out" secondary onPress={signOut} />
        </ScrollView>
      )}
      {step === 'workspace' && !keyboardVisible && (
        <TabBar
          destination={destination}
          select={setDestination}
          disabled={busy}
        />
      )}
    </View>
  );
}
