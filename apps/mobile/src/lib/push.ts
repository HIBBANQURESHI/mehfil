import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

let current: string | null = null;

export async function registerPush() {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return; // Filled in by `eas init`. Until then the in-app notification centre still works.
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Default', importance: Notifications.AndroidImportance.HIGH });
  current = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api('/notifications/push-tokens', { body: { token: current, platform: Platform.OS } });
}

export async function unregisterPush() {
  if (current) await api(`/notifications/push-tokens/${encodeURIComponent(current)}`, { method: 'DELETE' });
  current = null;
}
