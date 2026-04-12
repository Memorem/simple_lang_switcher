use serde::{Deserialize, Serialize};
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::Globalization::{
    GetLocaleInfoW, LOCALE_SENGLISHLANGUAGENAME, LOCALE_SLOCALIZEDLANGUAGENAME,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    ActivateKeyboardLayout, GetKeyboardLayout, GetKeyboardLayoutList, HKL, KLF_SETFORPROCESS,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, PostMessageW, WM_INPUTLANGCHANGEREQUEST,
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

/// Switches to a specific layout by HKL value.
pub fn switch_to_layout(hkl_value: isize) {
    unsafe {
        let hwnd = GetForegroundWindow();
        let hkl = HKL(hkl_value as *mut core::ffi::c_void);

        // Primary method: post message to foreground window
        let _ = PostMessageW(
            hwnd,
            WM_INPUTLANGCHANGEREQUEST,
            WPARAM(0),
            LPARAM(hkl_value),
        );

        // Fallback: ActivateKeyboardLayout for current process
        let _ = ActivateKeyboardLayout(hkl, KLF_SETFORPROCESS);
    }
}
