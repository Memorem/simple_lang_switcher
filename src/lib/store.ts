import { createSignal } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';

export interface LayoutInfo {
  hkl: number;
  lang_id: number;
  name: string;
  display_name: string;
}

export interface Settings {
  hotkey: string;
  auto_start: boolean;
  switch_sound: boolean;
  show_notification: boolean;
  polling_interval_ms: number;
  minimize_to_tray: boolean;
  switch_delay_ms: number;
  switch_delay_enabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: 'Alt+Shift',
  auto_start: true,
  switch_sound: false,
  show_notification: true,
  polling_interval_ms: 300,
  minimize_to_tray: true,
  switch_delay_ms: 50,
  switch_delay_enabled: false,
};

const [settings, setSettingsSignal] = createSignal<Settings>(DEFAULT_SETTINGS);
const [layouts, setLayouts] = createSignal<LayoutInfo[]>([]);
const [currentLayout, setCurrentLayout] = createSignal<LayoutInfo | null>(null);
const [isConnected, setIsConnected] = createSignal(false);

export { settings, layouts, currentLayout, isConnected };

export async function loadSettings(): Promise<void> {
  try {
    const result = await invoke<Settings>('get_settings');
    setSettingsSignal({ ...DEFAULT_SETTINGS, ...result });
  } catch {
    setSettingsSignal(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(newSettings: Settings): Promise<void> {
  setSettingsSignal(newSettings);
  try {
    await invoke('save_settings', { settings: newSettings });
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export async function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  const updated = { ...settings(), [key]: value };
  await saveSettings(updated);
}

export async function fetchLayouts(): Promise<void> {
  try {
    const result = await invoke<LayoutInfo[]>('get_layouts');
    setLayouts(result);
    setIsConnected(true);
  } catch {
    setIsConnected(false);
  }
}

export async function fetchCurrentLayout(): Promise<void> {
  try {
    const result = await invoke<LayoutInfo>('get_current_layout');
    setCurrentLayout(result);
  } catch {
    // silent
  }
}

export async function switchLanguage(): Promise<void> {
  try {
    await invoke('switch_language');
    await fetchCurrentLayout();
  } catch (e) {
    console.error('Failed to switch language:', e);
  }
}

export async function switchToLayout(hkl: number): Promise<void> {
  try {
    await invoke('switch_to_specific_layout', { hkl });
    await fetchCurrentLayout();
  } catch (e) {
    console.error('Failed to switch to layout:', e);
  }
}

// ─── Windows Hotkey Registry ─────────────────────────────────────────────────

const [windowsHotkeyEnabled, setWindowsHotkeyEnabled] = createSignal(true);
export { windowsHotkeyEnabled };

export async function checkWindowsHotkey(): Promise<void> {
  try {
    const enabled = await invoke<boolean>('get_windows_hotkey_status');
    setWindowsHotkeyEnabled(enabled);
  } catch {
    // silent
  }
}

export async function disableWindowsHotkeys(): Promise<void> {
  try {
    await invoke('disable_windows_hotkeys');
    setWindowsHotkeyEnabled(false);
  } catch (e) {
    console.error('Failed to disable Windows hotkeys:', e);
  }
}

export async function enableWindowsHotkeys(): Promise<void> {
  try {
    await invoke('enable_windows_hotkeys');
    setWindowsHotkeyEnabled(true);
  } catch (e) {
    console.error('Failed to enable Windows hotkeys:', e);
  }
}

// ─── Polling ─────────────────────────────────────────────────────────────────

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startPolling(intervalMs: number = 300): void {
  stopPolling();
  pollingInterval = setInterval(fetchCurrentLayout, intervalMs);
}

export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
