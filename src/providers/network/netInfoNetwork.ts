import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import type { NetworkMonitor } from './types';

// "Unknown" reachability counts as online: the app never blocks on it, requests just fail softly.
const online = (s: NetInfoState) => s.isConnected === true && s.isInternetReachable !== false;

export const netInfoNetwork: NetworkMonitor = {
  async isOnline() {
    return online(await NetInfo.fetch());
  },
  subscribe(listener) {
    return NetInfo.addEventListener((s) => listener(online(s)));
  },
};
