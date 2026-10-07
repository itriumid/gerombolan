//! The window around the game. Everything that plays runs in the webview: the simulation and the
//! drawing never cross into Rust, which only opens the window for now. Saves and settings come
//! here later.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Gerombolan");
}
