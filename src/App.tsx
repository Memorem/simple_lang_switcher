import { onMount, onCleanup, createSignal, For, Show } from 'solid-js';
import { getCurrentWindow, type Window as TauriWindow } from '@tauri-apps/api/window';
import {
  Languages,
  Settings as SettingsIcon,
  Keyboard,
  Minimize2,
  X,
  Power,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Monitor,
  Timer,
  ChevronRight,
  Zap,
  Globe,
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-solid';
import {
  settings,
  layouts,
  currentLayout,
  isConnected,
  windowsHotkeyEnabled,
  loadSettings,
  fetchLayouts,
  fetchCurrentLayout,
  checkWindowsHotkey,
  disableWindowsHotkeys,
  enableWindowsHotkeys,
  startPolling,
  stopPolling,
  updateSetting,
  switchLanguage,
  switchToLayout,
} from '~/lib/store';
import type { LayoutInfo, Settings } from '~/lib/store';
import { cn } from '~/lib/utils';

type Tab = 'status' | 'hotkeys' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = createSignal<Tab>('status');
  const [hotkeyRecording, setHotkeyRecording] = createSignal(false);
  const [recordedKeys, setRecordedKeys] = createSignal('');

  onMount(async () => {
    await loadSettings();
    await fetchLayouts();
    await fetchCurrentLayout();
    await checkWindowsHotkey();
    startPolling(settings().polling_interval_ms);
  });

  onCleanup(() => {
    stopPolling();
  });

  async function handleMinimize() {
    const win = getCurrentWindow();
    await win.hide();
  }

  async function handleClose() {
    const win = getCurrentWindow();
    if (settings().minimize_to_tray) {
      await win.hide();
    } else {
      await win.close();
    }
  }

  let recordedModifiers: string[] = [];

  function handleKeyDown(e: KeyboardEvent) {
    if (!hotkeyRecording()) return;
    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');

    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      // Regular key + modifiers — save immediately
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      const combo = parts.join('+');
      setRecordedKeys(combo);
      setHotkeyRecording(false);
      updateSetting('hotkey', combo);
      recordedModifiers = [];
    } else {
      // Only modifiers pressed — track them
      recordedModifiers = parts;
      setRecordedKeys(parts.join('+') + '...');
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (!hotkeyRecording()) return;
    // When a modifier is released and we had 2+ modifiers, save the combo
    if (recordedModifiers.length >= 2) {
      e.preventDefault();
      const combo = recordedModifiers.join('+');
      setRecordedKeys(combo);
      setHotkeyRecording(false);
      updateSetting('hotkey', combo);
      recordedModifiers = [];
    }
  }

  function handleDrag(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, select, input, a')) return;
    getCurrentWindow().startDragging();
  }

  return (
    <div
      class="flex flex-col h-screen bg-background"
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      tabIndex={-1}
    >
      {/* Title bar */}
      <div class="flex items-center justify-between px-4 h-12 shrink-0" onMouseDown={handleDrag}>
        <div class="flex items-center gap-2">
          <Languages class="w-5 h-5 text-primary" />
          <span class="text-sm font-semibold tracking-tight">LangSwitch</span>
          <Show when={isConnected()}>
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            class="p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <Minimize2 class="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={handleClose}
            class="p-1.5 rounded-md hover:bg-destructive/20 transition-colors"
          >
            <X class="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Current language hero */}
      <div class="px-4 pb-4">
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-accent/10 to-transparent border border-primary/20 p-5">
          <div class="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div class="flex items-center justify-between relative z-10">
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Current Language
              </p>
              <h2 class="text-2xl font-bold tracking-tight">
                {currentLayout()?.display_name || 'Loading...'}
              </h2>
              <p class="text-sm text-muted-foreground mt-0.5">
                {currentLayout()?.name || '—'}
              </p>
            </div>
            <button
              onClick={switchLanguage}
              class="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all shadow-lg shadow-primary/25"
            >
              <Zap class="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div class="flex px-4 gap-1">
        <TabButton
          active={activeTab() === 'status'}
          onClick={() => setActiveTab('status')}
          icon={<Globe class="w-4 h-4" />}
          label="Languages"
        />
        <TabButton
          active={activeTab() === 'hotkeys'}
          onClick={() => setActiveTab('hotkeys')}
          icon={<Keyboard class="w-4 h-4" />}
          label="Hotkeys"
        />
        <TabButton
          active={activeTab() === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={<SettingsIcon class="w-4 h-4" />}
          label="Settings"
        />
      </div>

      {/* Tab content */}
      <div class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <Show when={activeTab() === 'status'}>
          <LanguagesPanel />
        </Show>
        <Show when={activeTab() === 'hotkeys'}>
          <HotkeysPanel
            recording={hotkeyRecording()}
            recordedKeys={recordedKeys()}
            onStartRecording={() => {
              setHotkeyRecording(true);
              setRecordedKeys('');
            }}
          />
        </Show>
        <Show when={activeTab() === 'settings'}>
          <SettingsPanel />
        </Show>
      </div>

      {/* Status bar */}
      <div class="flex items-center justify-between px-4 h-8 shrink-0 border-t border-border/50 text-[11px] text-muted-foreground">
        <span>{layouts().length} languages installed</span>
        <span>v0.1.0</span>
      </div>
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
}) {
  return (
    <button
      onClick={props.onClick}
      class={cn(
        'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
        props.active
          ? 'bg-primary/15 text-primary border-primary/20'
          : 'text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground',
      )}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function LanguagesPanel() {
  return (
    <div class="space-y-1.5">
      <For each={layouts()}>
        {(layout: LayoutInfo) => (
          <button
            onClick={() => switchToLayout(layout.hkl)}
            class={cn(
              'flex items-center w-full gap-3 p-3 rounded-xl border transition-all text-left',
              currentLayout()?.hkl === layout.hkl
                ? 'bg-primary/10 border-primary/30 shadow-sm shadow-primary/10'
                : 'bg-card border-border hover:bg-secondary hover:border-border/80',
            )}
          >
            <div
              class={cn(
                'flex items-center justify-center w-10 h-10 rounded-xl text-sm font-bold',
                currentLayout()?.hkl === layout.hkl
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground',
              )}
            >
              {layout.name.slice(0, 2).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{layout.display_name}</p>
              <p class="text-xs text-muted-foreground">{layout.name}</p>
            </div>
            <Show when={currentLayout()?.hkl === layout.hkl}>
              <div class="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </Show>
            <ChevronRight class="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </For>
      <Show when={layouts().length === 0}>
        <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Globe class="w-12 h-12 mb-3 opacity-30" />
          <p class="text-sm">No languages detected</p>
          <p class="text-xs mt-1">Waiting for backend connection...</p>
        </div>
      </Show>
    </div>
  );
}

function HotkeysPanel(props: {
  recording: boolean;
  recordedKeys: string;
  onStartRecording: () => void;
}) {
  return (
    <div class="space-y-3">
      {/* Windows built-in hotkey control */}
      <div class="p-4 rounded-xl bg-card border border-border">
        <div class="flex items-center gap-2 mb-2">
          <AlertTriangle class="w-4 h-4 text-amber-500" />
          <span class="text-sm font-medium">Windows Built-in Switcher</span>
        </div>
        <p class="text-xs text-muted-foreground mb-3">
          Disable Windows default language hotkeys to avoid conflicts and double switching
        </p>
        <div class="flex items-center gap-2">
          <Show
            when={windowsHotkeyEnabled()}
            fallback={
              <button
                onClick={enableWindowsHotkeys}
                class="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium transition-all hover:bg-emerald-500/25"
              >
                <ShieldCheck class="w-4 h-4" />
                Disabled — LangSwitch controls everything
              </button>
            }
          >
            <button
              onClick={disableWindowsHotkeys}
              class="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium transition-all hover:bg-amber-500/25"
            >
              <ShieldOff class="w-4 h-4" />
              Enabled — Click to disable Windows hotkeys
            </button>
          </Show>
        </div>
      </div>

      {/* Switch language hotkey */}
      <div class="p-4 rounded-xl bg-card border border-border">
        <div class="flex items-center gap-2 mb-3">
          <Keyboard class="w-4 h-4 text-primary" />
          <span class="text-sm font-medium">Switch Language</span>
        </div>
        <p class="text-xs text-muted-foreground mb-3">
          Press the key combination to instantly switch between languages
        </p>
        <div class="flex items-center gap-2">
          <button
            onClick={props.onStartRecording}
            class={cn(
              'flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed transition-all text-sm font-mono',
              props.recording
                ? 'border-primary bg-primary/10 text-primary animate-pulse'
                : 'border-border hover:border-primary/50 text-foreground',
            )}
          >
            <Show
              when={props.recording}
              fallback={
                <span class="flex items-center gap-2">
                  <Keyboard class="w-4 h-4" />
                  {settings().hotkey}
                </span>
              }
            >
              <span>{props.recordedKeys || 'Press keys...'}</span>
            </Show>
          </button>
        </div>
      </div>

      {/* Predefined combos */}
      <div class="p-4 rounded-xl bg-card border border-border">
        <p class="text-sm font-medium mb-3">Quick Presets</p>
        <div class="grid grid-cols-2 gap-2">
          <PresetButton combo="Alt+Shift" current={settings().hotkey} />
          <PresetButton combo="Ctrl+Shift" current={settings().hotkey} />
          <PresetButton combo="Ctrl+Space" current={settings().hotkey} />
          <PresetButton combo="Win+Space" current={settings().hotkey} />
          <PresetButton combo="CapsLock" current={settings().hotkey} />
          <PresetButton combo="Ctrl+Alt" current={settings().hotkey} />
        </div>
      </div>

      {/* Info card */}
      <div class="p-3 rounded-xl bg-primary/5 border border-primary/10">
        <p class="text-xs text-primary/80">
          <strong>Tip:</strong> Click the hotkey box, press your desired key combination.
          LangSwitch will instantly switch languages when you press this combo anywhere in the system.
        </p>
      </div>
    </div>
  );
}

function PresetButton(props: { combo: string; current: string }) {
  return (
    <button
      onClick={() => updateSetting('hotkey', props.combo)}
      class={cn(
        'flex items-center justify-center h-10 rounded-lg border text-xs font-mono transition-all',
        props.current === props.combo
          ? 'bg-primary/15 border-primary/30 text-primary'
          : 'bg-secondary border-border text-foreground hover:border-primary/30',
      )}
    >
      {props.combo}
    </button>
  );
}

function SettingsPanel() {
  return (
    <div class="space-y-2">
      <SettingRow
        icon={<Power class="w-4 h-4" />}
        title="Auto-start"
        description="Launch LangSwitch when Windows starts"
        type="toggle"
        value={settings().auto_start}
        onChange={(v) => updateSetting('auto_start', v as boolean)}
      />
      <SettingRow
        icon={<Monitor class="w-4 h-4" />}
        title="Minimize to tray"
        description="Hide to system tray instead of closing"
        type="toggle"
        value={settings().minimize_to_tray}
        onChange={(v) => updateSetting('minimize_to_tray', v as boolean)}
      />
      <SettingRow
        icon={
          settings().switch_sound ? (
            <Volume2 class="w-4 h-4" />
          ) : (
            <VolumeX class="w-4 h-4" />
          )
        }
        title="Switch sound"
        description="Play a sound when language changes"
        type="toggle"
        value={settings().switch_sound}
        onChange={(v) => updateSetting('switch_sound', v as boolean)}
      />
      <SettingRow
        icon={
          settings().show_notification ? (
            <Bell class="w-4 h-4" />
          ) : (
            <BellOff class="w-4 h-4" />
          )
        }
        title="Show notification"
        description="Display a brief notification on switch"
        type="toggle"
        value={settings().show_notification}
        onChange={(v) => updateSetting('show_notification', v as boolean)}
      />
      <SettingRow
        icon={<Timer class="w-4 h-4" />}
        title="Polling interval"
        description="How often to check current language (ms)"
        type="select"
        value={settings().polling_interval_ms}
        options={[100, 200, 300, 500, 1000]}
        onChange={(v) => {
          const val = Number(v);
          updateSetting('polling_interval_ms', val);
          stopPolling();
          startPolling(val);
        }}
      />
      <SettingRow
        icon={<Keyboard class="w-4 h-4" />}
        title="Switch delay"
        description="Delay before switching (ms). Prevents conflicts with Shift+Alt+C etc."
        type="select"
        value={settings().switch_delay_ms}
        options={[0, 15, 30, 50, 75, 100, 150]}
        onChange={(v) => updateSetting('switch_delay_ms', Number(v))}
      />
    </div>
  );
}

function SettingRow(props: {
  icon: any;
  title: string;
  description: string;
  type: 'toggle' | 'select';
  value: boolean | number;
  options?: number[];
  onChange: (value: boolean | number) => void;
}) {
  return (
    <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card border border-border">
      <div class="flex items-center justify-center w-7 h-7 rounded-md bg-secondary text-primary shrink-0">
        {props.icon}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[13px] font-medium leading-tight">{props.title}</p>
        <p class="text-[11px] text-muted-foreground leading-tight">{props.description}</p>
      </div>
      <Show when={props.type === 'toggle'}>
        <button
          onClick={() => props.onChange(!(props.value as boolean))}
          class={cn(
            'relative shrink-0 w-11 h-6 rounded-full transition-colors overflow-hidden',
            props.value ? 'bg-primary' : 'bg-secondary',
          )}
        >
          <span
            class={cn(
              'block absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
              props.value ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </Show>
      <Show when={props.type === 'select' && props.options}>
        <select
          value={props.value as number}
          onChange={(e) => props.onChange(Number(e.currentTarget.value))}
          class="bg-secondary text-foreground text-xs rounded-lg px-2 h-8 border border-border focus:border-primary outline-none"
        >
          <For each={props.options}>
            {(opt) => (
              <option value={opt}>{opt}ms</option>
            )}
          </For>
        </select>
      </Show>
    </div>
  );
}
