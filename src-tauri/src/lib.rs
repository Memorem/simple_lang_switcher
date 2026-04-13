mod keyboard_hook;
mod lang_switch;

use lang_switch::LayoutInfo;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

static SETTINGS_PATH: OnceCell<PathBuf> = OnceCell::new();

// ─── Settings ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub hotkey: String,
    pub auto_start: bool,
    pub switch_sound: bool,
    pub show_notification: bool,
    pub polling_interval_ms: u64,
    pub minimize_to_tray: bool,
    #[serde(default = "default_switch_delay")]
    pub switch_delay_ms: u64,
}

fn default_switch_delay() -> u64 { 50 }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Shift".into(),
            auto_start: true,
            switch_sound: false,
            show_notification: true,
            polling_interval_ms: 300,
            minimize_to_tray: true,
            switch_delay_ms: 50,
        }
    }
}

fn settings_file(app: &AppHandle) -> PathBuf {
    SETTINGS_PATH
        .get_or_init(|| {
            let dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&dir).ok();
            dir.join("settings.json")
        })
        .clone()
}

fn load_settings(app: &AppHandle) -> AppSettings {
    let path = settings_file(app);
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

fn save_settings_to_file(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_file(app);
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn get_layouts() -> Vec<LayoutInfo> {
    lang_switch::get_installed_layouts()
}

#[tauri::command]
fn get_current_layout() -> LayoutInfo {
    lang_switch::get_current_layout()
}

#[tauri::command]
fn switch_language() {
    lang_switch::switch_to_next_layout();
}

#[tauri::command]
fn switch_to_specific_layout(hkl: isize) {
    lang_switch::switch_to_layout(hkl);
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    Ok(load_settings(&app))
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    // If hotkey changed, update the hook
    let old = load_settings(&app);
    if old.hotkey != settings.hotkey {
        keyboard_hook::update_hotkey(&settings.hotkey);
    }
    if old.switch_delay_ms != settings.switch_delay_ms {
        keyboard_hook::update_delay(settings.switch_delay_ms);
    }
    save_settings_to_file(&app, &settings)
}

// ─── Windows Registry — Disable/Enable built-in hotkeys ─────────────────────

#[tauri::command]
fn get_windows_hotkey_status() -> Result<bool, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey("Keyboard Layout\\Toggle")
        .map_err(|e| e.to_string())?;

    let hotkey: String = key.get_value("Hotkey").unwrap_or_else(|_| "1".into());
    Ok(hotkey != "3")
}

#[tauri::command]
fn disable_windows_hotkeys() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Keyboard Layout\\Toggle")
        .map_err(|e| e.to_string())?;

    key.set_value("Hotkey", &"3").map_err(|e| e.to_string())?;
    key.set_value("Language Hotkey", &"3").map_err(|e| e.to_string())?;
    key.set_value("Layout Hotkey", &"3").map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn enable_windows_hotkeys() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Keyboard Layout\\Toggle")
        .map_err(|e| e.to_string())?;

    key.set_value("Hotkey", &"1").map_err(|e| e.to_string())?;
    key.set_value("Language Hotkey", &"1").map_err(|e| e.to_string())?;
    key.set_value("Layout Hotkey", &"2").map_err(|e| e.to_string())?;

    Ok(())
}

// ─── System Tray ─────────────────────────────────────────────────────────────

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let switch = MenuItemBuilder::with_id("switch", "Switch Language").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .item(&switch)
        .separator()
        .item(&quit)
        .build()?;

    let current = lang_switch::get_current_layout();
    let short = lang_switch::lang_id_to_short_code(current.lang_id);

    let icon = app.default_window_icon().cloned().expect("no default icon");

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(false)
        .tooltip(&format!("LangSwitch — {}", short))
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "switch" => {
                lang_switch::switch_to_next_layout();
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ─── Layout Polling ──────────────────────────────────────────────────────────

fn start_layout_polling(app: AppHandle, interval_ms: u64) {
    let last_hkl: Arc<Mutex<isize>> = Arc::new(Mutex::new(0));

    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(interval_ms));

        let current = lang_switch::get_current_layout();
        let mut last = last_hkl.lock().unwrap();

        if current.hkl != *last {
            let is_first = *last == 0;
            *last = current.hkl;

            let short = lang_switch::lang_id_to_short_code(current.lang_id);

            if let Some(tray) = app.tray_by_id("main") {
                let _ = tray.set_tooltip(Some(&format!("LangSwitch — {}", short)));
            }

            let _ = app.emit("layout-changed", &current);

            // Send Windows notification (skip the initial detection)
            if !is_first {
                let settings = load_settings(&app);
                if settings.show_notification {
                    use tauri_plugin_notification::NotificationExt;
                    let _ = app
                        .notification()
                        .builder()
                        .title("LangSwitch")
                        .body(format!("{} — {}", short, current.display_name))
                        .show();
                }
            }
        }
    });
}

// ─── App Entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_layouts,
            get_current_layout,
            switch_language,
            switch_to_specific_layout,
            get_settings,
            save_settings,
            get_windows_hotkey_status,
            disable_windows_hotkeys,
            enable_windows_hotkeys,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Build system tray
            build_tray(&handle)?;

            // Load settings
            let settings = load_settings(&handle);

            // Start low-level keyboard hook for global hotkey
            keyboard_hook::start_hook(&settings.hotkey, settings.switch_delay_ms);

            // Start layout polling
            start_layout_polling(handle, settings.polling_interval_ms);

            // Hide window on close instead of quitting (tray app behavior)
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
