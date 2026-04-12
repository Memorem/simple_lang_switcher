use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VK_CAPITAL, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_MENU, VK_RCONTROL, VK_RMENU,
    VK_RSHIFT, VK_SHIFT, VK_SPACE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT, MSG,
    WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

use crate::lang_switch;

static HOTKEY_MOD_ALT: AtomicBool = AtomicBool::new(true);
static HOTKEY_MOD_CTRL: AtomicBool = AtomicBool::new(false);
static HOTKEY_MOD_SHIFT: AtomicBool = AtomicBool::new(true);
static HOTKEY_VK: AtomicU32 = AtomicU32::new(0);

static ALT_WAS_DOWN: AtomicBool = AtomicBool::new(false);
static SHIFT_WAS_DOWN: AtomicBool = AtomicBool::new(false);
static CTRL_WAS_DOWN: AtomicBool = AtomicBool::new(false);
static COMBO_DIRTY: AtomicBool = AtomicBool::new(false);

pub fn set_hotkey(hotkey: &str) {
    let parts: Vec<&str> = hotkey.split('+').map(|s| s.trim()).collect();

    let mut has_alt = false;
    let mut has_ctrl = false;
    let mut has_shift = false;
    let mut vk: u32 = 0;

    for part in &parts {
        match part.to_lowercase().as_str() {
            "alt" => has_alt = true,
            "shift" => has_shift = true,
            "ctrl" | "control" => has_ctrl = true,
            "space" => vk = VK_SPACE.0 as u32,
            "capslock" | "caps" => vk = VK_CAPITAL.0 as u32,
            s => {
                if s.len() == 1 {
                    vk = s.chars().next().unwrap().to_ascii_uppercase() as u32;
                }
            }
        }
    }

    HOTKEY_MOD_ALT.store(has_alt, Ordering::Relaxed);
    HOTKEY_MOD_CTRL.store(has_ctrl, Ordering::Relaxed);
    HOTKEY_MOD_SHIFT.store(has_shift, Ordering::Relaxed);
    HOTKEY_VK.store(vk, Ordering::Relaxed);
}

fn is_alt(vk: u32) -> bool {
    vk == VK_MENU.0 as u32 || vk == VK_LMENU.0 as u32 || vk == VK_RMENU.0 as u32
}

fn is_shift(vk: u32) -> bool {
    vk == VK_SHIFT.0 as u32 || vk == VK_LSHIFT.0 as u32 || vk == VK_RSHIFT.0 as u32
}

fn is_ctrl(vk: u32) -> bool {
    vk == VK_CONTROL.0 as u32 || vk == VK_LCONTROL.0 as u32 || vk == VK_RCONTROL.0 as u32
}

fn is_modifier(vk: u32) -> bool {
    is_alt(vk) || is_shift(vk) || is_ctrl(vk)
}

/// SAFETY: This hook NEVER consumes keys. It ALWAYS calls CallNextHookEx.
/// It only observes key events and triggers language switch as a side effect.
unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // Always pass through — never block input
    if code < 0 {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
    let vk = kb.vkCode;
    let msg = wparam.0 as u32;
    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

    let want_alt = HOTKEY_MOD_ALT.load(Ordering::Relaxed);
    let want_ctrl = HOTKEY_MOD_CTRL.load(Ordering::Relaxed);
    let want_shift = HOTKEY_MOD_SHIFT.load(Ordering::Relaxed);
    let want_vk = HOTKEY_VK.load(Ordering::Relaxed);

    if want_vk == 0 {
        // Modifier-only combo (e.g. Alt+Shift):
        // Track which modifiers are pressed. If a non-modifier key is pressed
        // in between, mark combo as dirty. On release of one modifier while
        // the other is still held (and combo is clean), fire the switch.

        if is_down {
            if is_alt(vk) {
                ALT_WAS_DOWN.store(true, Ordering::Relaxed);
            } else if is_shift(vk) {
                SHIFT_WAS_DOWN.store(true, Ordering::Relaxed);
            } else if is_ctrl(vk) {
                CTRL_WAS_DOWN.store(true, Ordering::Relaxed);
            } else {
                COMBO_DIRTY.store(true, Ordering::Relaxed);
            }
        }

        if is_up && !COMBO_DIRTY.load(Ordering::Relaxed) {
            let fire = if want_alt && want_shift && !want_ctrl {
                (is_alt(vk) && SHIFT_WAS_DOWN.load(Ordering::Relaxed))
                    || (is_shift(vk) && ALT_WAS_DOWN.load(Ordering::Relaxed))
            } else if want_ctrl && want_shift && !want_alt {
                (is_ctrl(vk) && SHIFT_WAS_DOWN.load(Ordering::Relaxed))
                    || (is_shift(vk) && CTRL_WAS_DOWN.load(Ordering::Relaxed))
            } else if want_ctrl && want_alt && !want_shift {
                (is_ctrl(vk) && ALT_WAS_DOWN.load(Ordering::Relaxed))
                    || (is_alt(vk) && CTRL_WAS_DOWN.load(Ordering::Relaxed))
            } else {
                false
            };

            if fire {
                // Spawn switch on a separate thread so the hook returns instantly
                std::thread::spawn(|| {
                    lang_switch::switch_to_next_layout();
                });
            }
        }

        // Reset tracking when modifier is released
        if is_up {
            if is_alt(vk) {
                ALT_WAS_DOWN.store(false, Ordering::Relaxed);
            }
            if is_shift(vk) {
                SHIFT_WAS_DOWN.store(false, Ordering::Relaxed);
            }
            if is_ctrl(vk) {
                CTRL_WAS_DOWN.store(false, Ordering::Relaxed);
            }
            // Reset dirty flag when all modifiers released
            if !ALT_WAS_DOWN.load(Ordering::Relaxed)
                && !SHIFT_WAS_DOWN.load(Ordering::Relaxed)
                && !CTRL_WAS_DOWN.load(Ordering::Relaxed)
            {
                COMBO_DIRTY.store(false, Ordering::Relaxed);
            }
        }
    } else if is_down && vk == want_vk {
        // Key + modifier combo (e.g. Ctrl+Space, CapsLock)
        let alt_ok = !want_alt || ALT_WAS_DOWN.load(Ordering::Relaxed);
        let ctrl_ok = !want_ctrl || CTRL_WAS_DOWN.load(Ordering::Relaxed);
        let shift_ok = !want_shift || SHIFT_WAS_DOWN.load(Ordering::Relaxed);

        if alt_ok && ctrl_ok && shift_ok {
            std::thread::spawn(|| {
                lang_switch::switch_to_next_layout();
            });
        }

        // Track modifiers for key+modifier combos too
        if is_modifier(vk) {
            if is_alt(vk) { ALT_WAS_DOWN.store(is_down, Ordering::Relaxed); }
            if is_shift(vk) { SHIFT_WAS_DOWN.store(is_down, Ordering::Relaxed); }
            if is_ctrl(vk) { CTRL_WAS_DOWN.store(is_down, Ordering::Relaxed); }
        }
    } else if is_modifier(vk) {
        // Track modifiers even when we have a VK target
        if is_alt(vk) { ALT_WAS_DOWN.store(is_down, Ordering::Relaxed); }
        if is_shift(vk) { SHIFT_WAS_DOWN.store(is_down, Ordering::Relaxed); }
        if is_ctrl(vk) { CTRL_WAS_DOWN.store(is_down, Ordering::Relaxed); }
    }

    // ALWAYS pass the key through — never consume input
    CallNextHookEx(None, code, wparam, lparam)
}

pub fn start_hook(hotkey: &str) {
    set_hotkey(hotkey);

    std::thread::spawn(|| unsafe {
        let _hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0)
            .expect("Failed to set keyboard hook");

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            DispatchMessageW(&msg);
        }
    });
}

pub fn update_hotkey(hotkey: &str) {
    set_hotkey(hotkey);
}
