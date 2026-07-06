mod engine;

#[tauri::command]
fn desktop_build_info() -> engine::BuildInfo {
    engine::build_info()
}

#[tauri::command]
fn normalize_seed(seed: Option<String>) -> engine::SeedInfo {
    engine::normalize_seed(seed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_build_info, normalize_seed])
        .run(tauri::generate_context!())
        .expect("failed to run Cradles Of Civilization");
}
