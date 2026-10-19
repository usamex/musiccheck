import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import {
  ALL_UNKNOWN,
  chooseServices,
  detectInstalled,
  isMusicServiceId,
  searchQuery,
  type InstallStatuses,
  type MusicService,
  type MusicServiceId,
} from './services';

export const PREFERRED_SERVICE_KEY = 'musiccheck.listen.preferred.v1';

async function loadPreferred(): Promise<MusicServiceId | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFERRED_SERVICE_KEY);
    return isMusicServiceId(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Which "Listen on" services to show for a track, and how to open one. Opening a service
 * remembers it as the user's preferred service (shown first next time).
 */
export function useListenServices(title: string, artist: string) {
  const [statuses, setStatuses] = useState<InstallStatuses>(ALL_UNKNOWN);
  const [preferred, setPreferred] = useState<MusicServiceId | null>(null);

  useEffect(() => {
    let alive = true;
    detectInstalled({
      os: Platform.OS,
      inExpoGo: isRunningInExpoGo(),
      canOpenURL: (url) => Linking.canOpenURL(url),
    })
      .then((s) => alive && setStatuses(s))
      .catch(() => undefined);
    loadPreferred().then((p) => alive && setPreferred(p));
    return () => {
      alive = false;
    };
  }, []);

  const open = useCallback(
    async (service: MusicService): Promise<boolean> => {
      setPreferred(service.id);
      AsyncStorage.setItem(PREFERRED_SERVICE_KEY, service.id).catch(() => undefined);
      try {
        await Linking.openURL(service.searchUrl(searchQuery(title, artist)));
        return true;
      } catch {
        return false;
      }
    },
    [title, artist],
  );

  return { services: chooseServices(statuses, preferred), open };
}
