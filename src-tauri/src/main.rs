#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{ClipboardManager, GlobalShortcutManager, Manager};

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let app_handle = app.handle();
      let app_shortcut = app_handle.clone();

      // Register Alt+Space global hotkey
      app_handle.global_shortcut_manager()
        .register("Alt+Space", move || {
          if let Some(window) = app_shortcut.get_window("main") {
            let is_visible = window.is_visible().unwrap_or(false);
            if is_visible {
              let _ = window.hide();
            } else {
              let _ = window.show();
              let _ = window.set_focus();

              // Grab the current operating system clipboard string
              let clipboard_text = app_shortcut
                .clipboard_manager()
                .read_text()
                .unwrap_or_default()
                .unwrap_or_default();

              // Emit the clipboard content to the frontend data pipeline
              let _ = window.emit("clipboard-trigger", clipboard_text);
            }
          }
        })
        .expect("Error registering Alt+Space global hotkey");

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
