import { MaterialIcons } from '@expo/vector-icons';
import { Link, router, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { DevTools } from '../components/DevTools';
import { IconButton } from '../components/IconButton';
import { IdentifyButton } from '../components/IdentifyButton';
import {
  errorCopy,
  formatElapsed,
  formatQueryInfo,
  noMatchCopy,
  type ErrorAction,
} from '../presentation/copy';
import type { RecognitionState } from '../recognition/machine';
import { useRecognition } from '../recognition/useRecognition';
import { radius, spacing, type as typography, useAppTheme } from '../theme/theme';

function buttonMode(state: RecognitionState): 'ready' | 'listening' | 'processing' | 'busy' {
  switch (state.status) {
    case 'listening':
      return 'listening';
    case 'processing':
      return 'processing';
    case 'requesting_permission':
      return 'busy';
    default:
      return 'ready';
  }
}

function buttonLabel(state: RecognitionState): string {
  switch (state.status) {
    case 'requesting_permission':
      return 'Starting…';
    case 'listening':
      return 'Listening…';
    case 'processing':
      return 'Identifying…';
    case 'no_match':
    case 'error':
      return 'Tap to try again';
    default:
      return 'Tap to identify';
  }
}

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const recognition = useRecognition();
  const { state } = recognition;
  const navigatedAttempt = useRef(0);

  // A fresh match opens the Result screen once per attempt.
  useEffect(() => {
    if (state.status === 'match_found' && navigatedAttempt.current !== state.attempt) {
      navigatedAttempt.current = state.attempt;
      router.push({ pathname: '/result', params: { id: state.response.request_id } });
    }
  }, [state]);

  const onErrorAction = (action: ErrorAction) => {
    if (action === 'open_settings') void Linking.openSettings();
    else if (action === 'retry') recognition.start();
    else recognition.reset();
  };

  const showCancel = state.status === 'listening' || state.status === 'processing';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/history" asChild>
              <IconButton icon="history" accessibilityLabel="History" testID="history-link" />
            </Link>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <StatusPanel state={state} />

        <IdentifyButton
          mode={buttonMode(state)}
          label={buttonLabel(state)}
          onPress={recognition.start}
        />

        {state.status === 'listening' ? (
          <View
            style={[styles.recordingPill, { backgroundColor: colors.surface }]}
            accessibilityLiveRegion="polite"
          >
            <View style={[styles.recDot, { backgroundColor: colors.recording }]} />
            <Text style={[styles.elapsed, { color: colors.text }]} testID="elapsed">
              Recording {formatElapsed(state.elapsedMs, state.durationMs)}
            </Text>
          </View>
        ) : null}

        {showCancel ? (
          <ActionButton
            title="Cancel"
            icon="close"
            onPress={recognition.cancel}
            testID="cancel-button"
          />
        ) : null}

        {state.status === 'error' ? (
          <ErrorPanel state={state} onAction={onErrorAction} />
        ) : null}

        {state.status === 'match_found' ? (
          <View style={styles.actionsRow}>
            <ActionButton
              title="View last result"
              variant="primary"
              onPress={() =>
                router.push({ pathname: '/result', params: { id: state.response.request_id } })
              }
            />
          </View>
        ) : null}

        <View style={styles.catalogNote}>
          <MaterialIcons name="info-outline" size={14} color={colors.textSubtle} />
          <Text style={[styles.catalogText, { color: colors.textSubtle }]}>
            Recognizes songs in our catalog — not every song ever recorded.
          </Text>
        </View>

        {__DEV__ ? (
          <DevTools
            disabled={state.status === 'listening' || state.status === 'processing' || state.status === 'requesting_permission'}
            onFilePicked={recognition.identifyFile}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function StatusPanel({ state }: { state: RecognitionState }) {
  const { colors } = useAppTheme();
  let title: string;
  let subtitle: string;
  switch (state.status) {
    case 'idle':
      title = 'Identify music';
      subtitle = 'Tap the button and hold your phone near the music.';
      break;
    case 'requesting_permission':
      title = 'Microphone';
      subtitle = 'Waiting for microphone permission…';
      break;
    case 'listening':
      title = 'Listening…';
      subtitle = 'Recording from the microphone. Keep the phone near the music.';
      break;
    case 'processing':
      title = state.phase === 'uploading' ? 'Identifying…' : 'Preparing…';
      subtitle =
        state.phase === 'uploading'
          ? state.source === 'file'
            ? 'Uploading the selected file and searching our catalog.'
            : 'Uploading the recording and searching our catalog.'
          : 'Finishing the recording…';
      break;
    case 'match_found':
      title = state.response.track.title;
      subtitle = state.response.track.artist;
      break;
    case 'no_match': {
      const copy = noMatchCopy(state.response);
      title = copy.title;
      subtitle = copy.message;
      break;
    }
    case 'error': {
      const copy = errorCopy(state.error);
      title = copy.title;
      subtitle = copy.message;
      break;
    }
  }
  return (
    <View style={styles.status} accessibilityLiveRegion="polite" testID={`status-${state.status}`}>
      <Text style={[styles.title, { color: state.status === 'error' ? colors.danger : colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSubtle }]}>{subtitle}</Text>
    </View>
  );
}

function ErrorPanel({
  state,
  onAction,
}: {
  state: Extract<RecognitionState, { status: 'error' }>;
  onAction: (a: ErrorAction) => void;
}) {
  const { colors } = useAppTheme();
  const copy = errorCopy(state.error);
  const labels: Record<ErrorAction, string> = {
    retry: state.source === 'file' ? 'Record instead' : 'Try again',
    open_settings: 'Open Settings',
    dismiss: 'Dismiss',
  };
  const query = formatQueryInfo(state.error.query);
  return (
    <View style={[styles.errorBox, { backgroundColor: colors.surface }]}>
      <View style={styles.actionsRow}>
        {copy.actions.map((a, i) => (
          <ActionButton
            key={a}
            title={labels[a]}
            variant={i === 0 ? 'primary' : 'secondary'}
            icon={a === 'open_settings' ? 'settings' : a === 'retry' ? 'refresh' : undefined}
            onPress={() => onAction(a)}
            testID={`error-action-${a}`}
          />
        ))}
      </View>
      {__DEV__ ? (
        <Text style={[styles.diag, { color: colors.textMuted }]} selectable>
          {[
            `kind=${state.error.kind}`,
            state.error.code ? `code=${state.error.code}` : null,
            state.error.httpStatus !== null ? `http=${state.error.httpStatus}` : null,
            state.error.requestId ? `request_id=${state.error.requestId}` : null,
            state.error.message,
            query,
          ]
            .filter(Boolean)
            .join('\n')}
        </Text>
      ) : state.error.requestId ? (
        <Text style={[styles.diag, { color: colors.textMuted }]} selectable>
          Reference: {state.error.requestId}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  status: { alignItems: 'center', gap: spacing.sm, minHeight: 88, maxWidth: 340 },
  title: { ...typography.display, textAlign: 'center' },
  subtitle: { ...typography.body, textAlign: 'center' },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  recDot: { width: 8, height: 8, borderRadius: 4 },
  elapsed: { fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '500' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  errorBox: {
    alignSelf: 'stretch',
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  diag: { ...typography.caption, textAlign: 'left' },
  catalogNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    maxWidth: 320,
  },
  catalogText: { ...typography.caption, textAlign: 'center', flexShrink: 1 },
});
