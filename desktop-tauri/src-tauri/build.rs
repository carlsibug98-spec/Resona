fn main() {
    // Register the app's own commands so tauri-build AUTOGENERATES their ACL
    // permissions (allow-server-url / allow-win-minimize / … — the slugified
    // forms referenced by capabilities/default.json). Without this list the
    // app ACL manifest stays empty, every permission reference in the
    // capability fails validation, and Tauri denies all IPC at runtime —
    // the shell could start no server and could not even be closed.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "server_url",
                "server_ready",
                "win_minimize",
                "win_toggle_max",
                "win_close",
                "win_is_max",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
