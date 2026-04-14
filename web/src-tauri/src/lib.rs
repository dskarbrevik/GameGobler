use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

/// Start the Python backend sidecar and wait for it to be ready.
fn spawn_backend(app: &tauri::AppHandle) {
    let shell = app.shell();
    let sidecar = match shell.sidecar("gamegobler-api") {
        Ok(cmd) => cmd,
        Err(e) => {
            log::error!("failed to create gamegobler-api sidecar command: {}", e);
            return;
        }
    };

    let (mut rx, child) = match sidecar.spawn() {
        Ok(result) => result,
        Err(e) => {
            log::error!("failed to spawn gamegobler-api sidecar: {}", e);
            return;
        }
    };

    // Store the child so we can kill it on exit.
    app.manage(SidecarChild(std::sync::Mutex::new(Some(child))));

    // Log sidecar stdout/stderr in a background task.
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log::info!("[backend] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    log::warn!("[backend] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(status) => {
                    log::info!("[backend] terminated with {:?}", status);
                    break;
                }
                _ => {}
            }
        }
    });
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Show GameGobler").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().unwrap())
        .tooltip("GameGobler")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                kill_sidecar(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Kill the sidecar process if it's still running.
fn kill_sidecar(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<SidecarChild>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

struct SidecarChild(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            spawn_backend(app.handle());
            setup_tray(app)?;

            // Check for updates in the background (non-blocking).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Wait a few seconds for the app to settle before checking.
                std::thread::sleep(std::time::Duration::from_secs(5));
                match handle.updater() {
                    Ok(updater) => match updater.check().await {
                        Ok(Some(update)) => {
                            log::info!(
                                "Update available: {} → {}",
                                update.current_version,
                                update.version
                            );
                        }
                        Ok(None) => {
                            log::info!("App is up to date");
                        }
                        Err(e) => {
                            log::warn!("Update check failed: {}", e);
                        }
                    },
                    Err(e) => {
                        log::warn!("Updater not configured: {}", e);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide window on close instead of quitting (tray keeps running).
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                kill_sidecar(app);
            }
        });
}
