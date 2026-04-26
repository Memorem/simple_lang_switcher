use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::Globalization::{
    GetLocaleInfoW, LOCALE_SENGLISHLANGUAGENAME, LOCALE_SLOCALIZEDLANGUAGENAME,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    ActivateKeyboardLayout, GetKeyboardLayout, GetKeyboardLayoutList, HKL,
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    KLF_SETFORPROCESS, SendInput, VK_LMENU, VK_LSHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, PostMessageW,
    GUITHREADINFO, WM_INPUTLANGCHANGEREQUEST,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutInfo {
    /// The HKL value as isize for serialization
    pub hkl: isize,
    /// Low word: LANGID
    pub lang_id: u16,
    /// English language name (e.g. "English", "Russian")
    pub name: String,
    /// Localized display name
    pub display_name: String,
}

/// Get a short 2-3 letter code from a LANGID (e.g. "EN", "RU").
pub fn lang_id_to_short_code(lang_id: u16) -> String {
    let mut buf = [0u16; 10];
    // LOCALE_SABBREVLANGNAME = 0x03
    let len = unsafe { GetLocaleInfoW(lang_id as u32, 0x00000003u32, Some(&mut buf)) };
    if len > 0 {
        let s = String::from_utf16_lossy(&buf[..((len as usize).saturating_sub(1))]);
        s.chars().take(2).collect::<String>().to_uppercase()
    } else {
        format!("{:04X}", lang_id)
    }
}

fn locale_info(lang_id: u16, lc_type: u32) -> String {
    let mut buf = [0u16; 256];
    let len = unsafe { GetLocaleInfoW(lang_id as u32, lc_type, Some(&mut buf)) };
    if len > 0 {
        String::from_utf16_lossy(&buf[..((len as usize).saturating_sub(1))])
    } else {
        format!("Unknown (0x{:04X})", lang_id)
    }
}

fn hkl_to_layout_info(hkl: HKL) -> LayoutInfo {
    let raw = hkl.0 as isize;
    let lang_id = (raw & 0xFFFF) as u16;
    let name = locale_info(lang_id, LOCALE_SENGLISHLANGUAGENAME);
    let display_name = locale_info(lang_id, LOCALE_SLOCALIZEDLANGUAGENAME);

    LayoutInfo {
        hkl: raw,
        lang_id,
        name,
        display_name,
    }
}

/// Returns all installed keyboard layouts.
pub fn get_installed_layouts() -> Vec<LayoutInfo> {
    let count = unsafe { GetKeyboardLayoutList(None) };
    if count == 0 {
        return Vec::new();
    }
    let mut hkls = vec![HKL::default(); count as usize];
    let actual = unsafe { GetKeyboardLayoutList(Some(&mut hkls)) };
    hkls.truncate(actual as usize);
    hkls.into_iter().map(hkl_to_layout_info).collect()
}

/// Returns the current keyboard layout of the foreground window.
pub fn get_current_layout() -> LayoutInfo {
    unsafe {
        let hwnd = GetForegroundWindow();
        let thread_id = GetWindowThreadProcessId(hwnd, None);
        let hkl = GetKeyboardLayout(thread_id);
        hkl_to_layout_info(hkl)
    }
}

/// Switches to the next layout in the list.
pub fn switch_to_next_layout() {
    let layouts = get_installed_layouts();
    if layouts.len() < 2 {
        return;
    }
    let current = get_current_layout();
    let current_idx = layouts
        .iter()
        .position(|l| l.hkl == current.hkl)
        .unwrap_or(0);
    let next_idx = (current_idx + 1) % layouts.len();
    switch_to_layout(layouts[next_idx].hkl);
}

/// Switches to next layout by simulating Alt+Shift keystroke via SendInput.
/// Fallback used only when Windows built-in hotkeys are enabled.
#[allow(dead_code)]
pub fn switch_via_sendinput() {
    unsafe {
        let inputs = [
            make_key_input(VK_LMENU.0, false),
            make_key_input(VK_LSHIFT.0, false),
            make_key_input(VK_LSHIFT.0, true),
            make_key_input(VK_LMENU.0, true),
        ];
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

/// Magic marker to identify our own simulated keystrokes
pub const LANGSWITCH_MAGIC: usize = 0x4C53_5749; // "LSWI"

#[allow(dead_code)]
fn make_key_input(vk: u16, key_up: bool) -> INPUT {
    let mut flags = KEYBD_EVENT_FLAGS(0);
    if key_up {
        flags = KEYEVENTF_KEYUP;
    }
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: LANGSWITCH_MAGIC,
            },
        },
    }
}

/// Switches to a specific layout by HKL value.
///
/// Safe two-step approach — never touches another thread's input queue:
/// 1. `ActivateKeyboardLayout` in our process — keeps layout enumeration in sync.
/// 2. `PostMessageW(WM_INPUTLANGCHANGEREQUEST)` to the foreground window AND to
///    the actually-focused child reported by `GetGUIThreadInfo` (modal dialogs
///    often only forward the message to the focused child).
///
/// We deliberately do NOT use `AttachThreadInput`. Even though it makes layout
/// changes stick in stubborn windows like Win+R / file pickers, it merges keyboard
/// input state between threads. In practice this corrupts the shell's modifier
/// tracking — Shift gets stuck "pressed" globally, which breaks Alt+Tab direction,
/// taskbar click-to-activate (Shift+click = open new instance) and Win key.
pub fn switch_to_layout(hkl_value: isize) {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return;
        }

        let hkl = HKL(hkl_value as *mut core::ffi::c_void);

        // Keep our own process aware of the new layout
        let _ = ActivateKeyboardLayout(hkl, KLF_SETFORPROCESS);

        // Ask the foreground window to switch
        let _ = PostMessageW(
            hwnd,
            WM_INPUTLANGCHANGEREQUEST,
            WPARAM(0),
            LPARAM(hkl_value),
        );

        // Modal dialogs often only react to messages addressed to the focused child
        let target_thread = GetWindowThreadProcessId(hwnd, None);
        if target_thread != 0 {
            let mut gti = GUITHREADINFO {
                cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
                ..Default::default()
            };
            if GetGUIThreadInfo(target_thread, &mut gti).is_ok()
                && !gti.hwndFocus.0.is_null()
                && gti.hwndFocus != hwnd
            {
                let _ = PostMessageW(
                    gti.hwndFocus,
                    WM_INPUTLANGCHANGEREQUEST,
                    WPARAM(0),
                    LPARAM(hkl_value),
                );
            }
        }
    }
}
