import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, styles } from '../theme';
import { BrowserCanvas, CanvasHandle } from './BrowserCanvas';
import { BrowserCommand, BrowserPresentation, browserLabel } from './protocol';

function Tool({
  label,
  onPress,
  disabled = false,
  primary = false,
}: Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        local.tool,
        primary && local.primary,
        disabled && local.disabled,
        pressed && local.pressed,
      ]}
    >
      <Text style={[local.toolText, primary && local.primaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}
function pageName(value: BrowserPresentation | null) {
  if (!value?.url) return 'Your browser';
  try {
    return new URL(value.url).hostname;
  } catch {
    return 'Your browser';
  }
}
function BrowserHeader({
  full,
  state,
  blocked,
  back,
  onAddress,
  onTools,
  onReturn,
  expand,
  dismiss,
}: Readonly<{
  full: boolean;
  state: BrowserPresentation | null;
  blocked: boolean;
  back: () => void;
  onAddress: () => void;
  onTools: () => void;
  onReturn: () => void;
  expand: () => void;
  dismiss: () => void;
}>) {
  const live = state?.state === 'live';
  return (
    <>
      {full ? (
        <View style={local.header}>
          <Tool label="Chat" onPress={back} />
          <Pressable
            style={local.address}
            accessibilityRole="button"
            accessibilityLabel="Search or enter address"
            disabled={!state?.human || blocked}
            onPress={onAddress}
          >
            <Text numberOfLines={1} style={local.pageTitle}>
              {state?.title || pageName(state)}
            </Text>
            <Text numberOfLines={1} style={styles.small}>
              {pageName(state)}
            </Text>
          </Pressable>
          <Tool label="Tools" onPress={onTools} />
        </View>
      ) : (
        <View style={local.previewHeader}>
          <View style={local.liveDot} />
          <Text style={local.previewTitle}>
            {state?.active ? 'Agent is browsing' : 'Browser ready'}
          </Text>
          <Tool label="Expand" onPress={expand} />
          <Tool label="Hide preview" onPress={dismiss} />
        </View>
      )}
      {full && live && (
        <View style={local.status}>
          <View style={[local.liveDot, !state?.human && local.agentDot]} />
          <Text accessibilityLiveRegion="polite" style={local.statusText}>
            {browserLabel(state)}
          </Text>
          <Text style={styles.small}>
            {state?.playback === 'live' ? 'Live view' : 'View connecting'}
          </Text>
          {state?.human && (
            <Tool
              label={state.returning ? 'Returning…' : 'Return to agent'}
              primary
              disabled={blocked || !state.canReturn}
              onPress={onReturn}
            />
          )}
        </View>
      )}
    </>
  );
}

export type BrowserHandoff = 'paused' | 'private' | 'observe' | 'elsewhere';

export function BrowserHandoffHint({
  mode,
  open,
}: Readonly<{ mode: BrowserHandoff; open: () => void }>) {
  const elsewhere = mode === 'elsewhere';
  const title: Record<BrowserHandoff, string> = {
    paused: 'Browser paused',
    private: 'Private · Only you',
    observe: 'You control · Agent can read',
    elsewhere: 'Open on another device',
  };
  let detail = 'Choose Return to agent to let Radhouse browse.';
  if (elsewhere) detail = 'Review the browser before moving control here.';
  else if (mode === 'paused')
    detail = 'Take control, then choose Return to agent.';
  return (
    <View style={local.handoff}>
      <Text accessibilityLiveRegion="polite" style={local.statusText}>
        {title[mode]}
      </Text>
      <Text style={styles.small}>{detail}</Text>
      <Tool
        label={elsewhere ? 'Review browser' : 'Open browser to return'}
        primary
        onPress={open}
      />
    </View>
  );
}

function handoffMode(state: BrowserPresentation | null): BrowserHandoff | null {
  if (!state?.authenticated || state.state !== 'live' || state.uncertain)
    return null;
  if (state.mode === 'paused') return 'paused';
  if (state.mode !== 'human') return null;
  if (!state.human) return 'elsewhere';
  return state.observing ? 'observe' : 'private';
}

function CanvasStatus({
  full,
  state,
  failure,
  blocked,
  send,
}: Readonly<{
  full: boolean;
  state: BrowserPresentation | null;
  failure: boolean;
  blocked: boolean;
  send: (command: BrowserCommand) => void;
}>) {
  const live = state?.state === 'live';
  return (
    <>
      {full && (state?.state !== 'live' || failure) && (
        <View style={local.empty}>
          {!state && !failure ? <ActivityIndicator color={colors.ink} /> : null}
          <Text style={local.emptyTitle}>
            {failure || state?.state === 'unavailable'
              ? 'Let’s reconnect'
              : 'A shared place to explore'}
          </Text>
          <Text style={local.emptyDetail}>
            {failure
              ? 'The connection was interrupted. Your last browser action has not been repeated.'
              : 'Open a page, take a closer look, then bring it back into your conversation.'}
          </Text>
          {state?.state === 'idle' && !failure ? (
            <Tool
              label="Open browser"
              primary
              disabled={blocked}
              onPress={() => send({ action: 'open' })}
            />
          ) : (
            <Tool
              label="Check connection"
              onPress={() => send({ action: 'refresh' })}
            />
          )}
        </View>
      )}
      {full &&
        live &&
        ['stalled', 'tap_required', 'unavailable'].includes(state.playback) && (
          <View style={local.connectionCard}>
            <Text style={styles.body}>The live view paused.</Text>
            <Tool
              label="Reconnect view"
              onPress={() => send({ action: 'reconnect' })}
            />
          </View>
        )}
    </>
  );
}

function BrowserTools({
  visible,
  state,
  blocked,
  zoom,
  send,
  onClose,
  onZoom,
}: Readonly<{
  visible: boolean;
  state: BrowserPresentation | null;
  blocked: boolean;
  zoom: boolean;
  send: (command: BrowserCommand) => void;
  onClose: () => void;
  onZoom: (enabled: boolean) => void;
}>) {
  const live = state?.state === 'live';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={local.modal}>
        <Pressable
          style={local.scrim}
          accessibilityRole="button"
          accessibilityLabel="Dismiss browser tools"
          onPress={onClose}
        />
        <View style={local.sheet}>
          <View style={styles.spread}>
            <Text style={local.sheetTitle}>Browser tools</Text>
            <Tool label="Done" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.body}>{browserLabel(state)}</Text>
            {state?.human && (
              <>
                <Text style={local.explanation}>
                  {state.observing
                    ? 'The agent can read this page when you ask in chat. You still control it.'
                    : 'The agent cannot see this page while you are in Private mode.'}
                </Text>
                <Tool
                  label={
                    state.observing
                      ? 'Make private'
                      : 'Let agent read this page'
                  }
                  disabled={blocked}
                  onPress={() =>
                    send({
                      action: 'visibility',
                      mode: state.observing ? 'private' : 'observe',
                    })
                  }
                />
                <View style={local.footer}>
                  <Tool
                    label="Back"
                    disabled={blocked || !state.inputReady}
                    onPress={() => send({ action: 'key', key: 'back' })}
                  />
                  <Tool
                    label="Reload"
                    disabled={blocked || !state.inputReady}
                    onPress={() => send({ action: 'key', key: 'reload' })}
                  />
                </View>
                <Tool
                  label="Dismiss keyboard"
                  onPress={() => send({ action: 'hideKeyboard' })}
                />
                <View style={local.footer}>
                  {(['tab', 'enter', 'escape'] as const).map(key => (
                    <Tool
                      key={key}
                      label={key.charAt(0).toUpperCase() + key.slice(1)}
                      disabled={blocked || !state.inputReady}
                      onPress={() => send({ action: 'key', key })}
                    />
                  ))}
                </View>
              </>
            )}
            <Tool
              label={zoom ? 'Fit page' : 'Zoom to read'}
              disabled={!live}
              onPress={() => {
                onZoom(!zoom);
                onClose();
              }}
            />
            <Tool
              label="Reconnect view"
              disabled={!live}
              onPress={() => {
                send({ action: 'reconnect' });
                onClose();
              }}
            />
            {state?.previousDownloadsUnavailable && (
              <Text style={local.explanation}>
                Downloads from an earlier browser are unavailable. No missing
                file has been marked as saved.
              </Text>
            )}
            <Tool
              label="Close browser"
              disabled={
                blocked || !live || (state?.mode === 'human' && !state?.human)
              }
              onPress={() => {
                send({ action: 'close' });
                onClose();
              }}
            />
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function NativeBrowser({
  origin,
  tab,
  full,
  compact = false,
  expand,
  back,
  onExpired,
  onReturned,
  onHandoff,
}: Readonly<{
  origin: string;
  tab: string;
  full: boolean;
  compact?: boolean;
  expand: () => void;
  back: () => void;
  onExpired: () => void;
  onReturned: () => void;
  onHandoff?: (mode: BrowserHandoff | null) => void;
}>) {
  const canvas = useRef<CanvasHandle>(null);
  const [state, setState] = useState<BrowserPresentation | null>(null);
  const [tools, setTools] = useState(false),
    [address, setAddress] = useState(false),
    [draft, setDraft] = useState('');
  const [zoom, setZoom] = useState(false),
    [failure, setFailure] = useState(false);
  const preview =
    (state?.previewAvailable ?? state?.active) === true &&
    state?.mode === 'agent' &&
    !failure;
  const live = state?.state === 'live';
  const blocked = !state || state.busy || state.uncertain || failure;
  const handoff = full || failure ? null : handoffMode(state);
  React.useEffect(() => onHandoff?.(handoff), [handoff, onHandoff]);
  React.useEffect(() => () => onHandoff?.(null), [onHandoff]);
  React.useEffect(() => {
    if (!full) {
      setTools(false);
      setAddress(false);
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!full) return false;
        if (address) setAddress(false);
        else if (tools) setTools(false);
        else back();
        return true;
      },
    );
    return () => subscription.remove();
  }, [full, address, tools, back]);
  function send(command: BrowserCommand) {
    canvas.current?.command(command);
  }
  function dismissTools() {
    setTools(false);
  }
  function submitAddress() {
    if (!draft.trim() || blocked || !state?.inputReady) return;
    Keyboard.dismiss();
    setAddress(false);
    send({ action: 'address', value: draft });
  }
  const hidden = !full && !preview;
  return (
    <View
      style={[
        full ? local.full : local.preview,
        !full && compact && local.compact,
        hidden && local.hidden,
      ]}
      pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <BrowserHeader
        full={full}
        state={state}
        blocked={blocked}
        back={back}
        onAddress={() => {
          setDraft(state?.url || '');
          setAddress(true);
        }}
        onTools={() => setTools(true)}
        onReturn={() => send({ action: 'return' })}
        expand={expand}
        dismiss={() => send({ action: 'dismissPreview' })}
      />
      <View style={local.viewport}>
        <BrowserCanvas
          ref={canvas}
          origin={origin}
          tab={tab}
          full={full}
          onState={value => {
            setFailure(false);
            setState(value);
          }}
          onFailure={() => setFailure(true)}
          onExpired={onExpired}
          onReturned={() => {
            setTools(false);
            onReturned();
          }}
        />
        <CanvasStatus
          full={full}
          state={state}
          failure={failure}
          blocked={blocked}
          send={send}
        />
      </View>
      {full && zoom && live && (
        <View style={local.footer}>
          <Text style={[styles.small, local.grow]}>
            Zoomed for reading. Pan to look around; fit the page to interact.
          </Text>
          <Tool
            label="Fit page"
            onPress={() => {
              setZoom(false);
              send({ action: 'zoom', enabled: false });
            }}
          />
        </View>
      )}
      {full && state?.notice ? (
        <Text accessibilityRole="alert" style={local.notice}>
          {state.notice}
        </Text>
      ) : null}
      {full && state?.uncertain ? (
        <Tool
          label="Refresh browser state"
          onPress={() => send({ action: 'refresh' })}
        />
      ) : null}
      {full && live && (
        <>
          {state.human && !state.canReturn && (
            <Text style={local.notice}>
              Your assistant’s current reply is finishing. You can return
              control when it ends.
            </Text>
          )}
          <View style={local.footer}>
            {state.human ? (
              <>
                <Tool
                  label="Keyboard"
                  disabled={blocked || !state.inputReady}
                  onPress={() => send({ action: 'keyboard' })}
                />
              </>
            ) : (
              <>
                <Text style={[styles.small, local.grow]}>
                  {state.mode === 'paused'
                    ? 'Take control, then choose Return to agent.'
                    : 'Watch here, or take control when you need to.'}
                </Text>
                <Tool
                  label="Take control"
                  primary
                  disabled={blocked || !state.canTake}
                  onPress={() => send({ action: 'take' })}
                />
              </>
            )}
          </View>
        </>
      )}
      {!full && (
        <>
          <Text numberOfLines={1} style={local.previewCaption}>
            {state?.title || pageName(state)}
          </Text>
          <Pressable
            style={[StyleSheet.absoluteFill, local.previewOverlay]}
            accessibilityRole="button"
            accessibilityLabel={`Expand live browser: ${
              state?.title || pageName(state)
            }`}
            onPress={expand}
          />
        </>
      )}
      <Modal
        visible={full && address}
        transparent
        animationType="slide"
        onRequestClose={() => setAddress(false)}
      >
        <KeyboardAvoidingView
          style={local.modal}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <SafeAreaView style={local.sheet}>
            <Text style={local.sheetTitle}>Go somewhere</Text>
            <TextInput
              accessibilityLabel="Browser address or search"
              placeholder="Search or enter address"
              value={draft}
              onChangeText={setDraft}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
              returnKeyType="go"
              maxLength={2048}
              onSubmitEditing={submitAddress}
              style={styles.input}
            />
            <View style={local.footer}>
              <Tool label="Cancel" onPress={() => setAddress(false)} />
              <Tool
                label="Go"
                primary
                disabled={blocked || !draft.trim() || !state?.inputReady}
                onPress={submitAddress}
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      <BrowserTools
        visible={full && tools}
        state={state}
        blocked={blocked}
        zoom={zoom}
        send={send}
        onClose={dismissTools}
        onZoom={enabled => {
          setZoom(enabled);
          send({ action: 'zoom', enabled });
        }}
      />
    </View>
  );
}
const local = StyleSheet.create({
  full: { flex: 1, backgroundColor: colors.paper },
  preview: {
    height: 224,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  compact: { height: 116 },
  handoff: {
    gap: 4,
    padding: 8,
    alignItems: 'flex-start',
    borderRadius: 14,
    backgroundColor: colors.soft,
  },
  // WebViews defer loading at zero size. Keep a laid-out, non-interactive,
  // invisible status surface so a cold chat can discover active browsing.
  hidden: {
    position: 'absolute',
    width: 320,
    height: 320,
    opacity: 0,
    margin: 0,
    borderWidth: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  address: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.soft,
    paddingHorizontal: 12,
  },
  pageTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
  status: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.ink,
  },
  agentDot: { backgroundColor: '#8A642B' },
  viewport: { flex: 1, overflow: 'hidden' },
  previewOverlay: { top: 52 },
  previewHeader: {
    height: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  previewTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.ink },
  expandLabel: { fontSize: 12, color: colors.muted },
  previewCaption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 12,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grow: { flex: 1 },
  tool: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  primary: { backgroundColor: colors.ink },
  primaryText: { color: colors.paper },
  toolText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.65 },
  empty: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 18,
  },
  emptyTitle: {
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyDetail: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 360,
  },
  connectionCard: {
    position: 'absolute',
    alignSelf: 'center',
    top: '35%',
    padding: 20,
    borderRadius: 18,
    backgroundColor: colors.card,
    gap: 12,
  },
  notice: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#10251F66' },
  scrim: { flex: 1 },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 16,
  },
  sheetTitle: { fontSize: 23, fontWeight: '600', color: colors.ink },
  explanation: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginVertical: 12,
  },
});
