//! Resona — the Rust (Tauri 2) desktop shell.
//!
//! Same architecture as the Electron shell (desktop/main.js), same server
//! bundle, same user data — only the shell is Rust:
//!
//! 1. spawn the bundled Node sidecar running the Next.js standalone server
//!    (`resources/server/server.js`) on a free 127.0.0.1 port, with the exact
//!    environment Electron used (NODE_PATH=deps, RESONA_DB_PATH, YTDLP_PATH…)
//! 2. poll until the server answers on `/`
//! 3. open a frameless window pointed at `http://127.0.0.1:<port>/`
//! 4. define `window.resonaDesktop` via an initialization script so the
//!    existing React window-controls (AppShell/WindowControls/TaskbarControls)
//!    work unchanged — mpv stays undefined, so playback rides the (v1.7.8-
//!    fixed) HTML5 chain, exactly like the web build.
//!
//! This shell is ADDITIVE to the working Electron app, not a rewrite of it:
//! the v1.7.8 root-cause playback fix lives in the shared renderer, which
//! this shell loads unchanged.

use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Shared server state: chosen port + the child process handle. Managed in
/// setup() so the commands never race a missing state entry.
struct ServerState {
    port: AtomicU16,
    child: Mutex<Option<Child>>,
}

/// Pick a free high port the same way Electron's pickPort() does: bind once
/// to an OS-assigned port, note the number, drop the listener. The tiny
/// bind/connect race is irrelevant in practice (Electron has the same one).
fn pick_port() -> u16 {
    if let Ok(l) = TcpListener::bind(("127.0.0.1", 0)) {
        if let Ok(addr) = l.local_addr() {
            return addr.port();
        }
    }
    39001 // unreachable fallback; the splash's poll catches a collision
}

/// One predictable data dir, mirroring desktop/main.js resonaDataDir():
/// `C:\Resona` on Windows (falls back to %LOCALAPPDATA%\Resona), then
/// ~/.config/Resona on Linux — so the SQLite cache and the library survive
/// updates and are SHARED between the Electron and Tauri shells.
fn data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let c = PathBuf::from(r"C:\Resona");
        if std::fs::create_dir_all(c.join("data")).is_ok() {
            return c;
        }
        if let Ok(la) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(la).join("Resona");
            let _ = std::fs::create_dir_all(p.join("data"));
            return p;
        }
        PathBuf::from("Resona-data")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let p = PathBuf::from(home).join(".config").join("Resona");
        let _ = std::fs::create_dir_all(p.join("data"));
        p
    }
}

/// The bundled Node sidecar. In PACKAGED builds the tauri bundler installs
/// `externalBin` targets FLAT next to the main executable (`$INSTDIR\node.exe`
/// — the `binaries/node-x86_64-pc-windows-msvc.exe` source name is flattened
/// to `node.exe` at install time), so that is checked first; the nested
/// `binaries/node` layout remains the dev-mode fallback.
fn node_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    for rel in [name, &format!("binaries{}{}", std::path::MAIN_SEPARATOR, name)] {
        let p = dir.join(rel);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Spawn the Next standalone server with Electron's exact environment.
/// Logs go to `<data>/logs/server.log` like the Electron shell's server.log.
fn spawn_server(resource_base: &PathBuf) -> Result<(u16, Child), String> {
    let server_dir = resource_base.join("resources").join("server");
    let server_js = server_dir.join("server.js");
    if !server_js.exists() {
        return Err(format!(
            "server bundle missing: {}",
            server_js.display()
        ));
    }
    let node =
        node_path().ok_or_else(|| "bundled Node sidecar missing (binaries/node)".to_string())?;

    let port = pick_port();
    let base = data_dir();
    let _ = std::fs::create_dir_all(base.join("logs"));

    let log_path = base.join("logs").join("server.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&log_path)
        .map_err(|e| format!("cannot open server log {}: {e}", log_path.display()))?;
    let log_err = log_file
        .try_clone()
        .map_err(|e| format!("cannot clone log handle: {e}"))?;

    let mut cmd = Command::new(&node);
    cmd.current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        // the staged server keeps its dependencies in "deps" (renamed from
        // node_modules by scripts/stage-desktop.js — see that file's note)
        .env("NODE_PATH", server_dir.join("deps"))
        .env("RESONA_DB_PATH", base.join("data").join("resona.db"))
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_err));

    let ytdlp_name = if cfg!(target_os = "windows") { "yt-dlp.exe" } else { "yt-dlp" };
    let ytdlp = resource_base.join("resources").join(ytdlp_name);
    if ytdlp.exists() {
        cmd.env("YTDLP_PATH", ytdlp);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW — release builds have no console; without this a
        // console flashes on every launch
        cmd.creation_flags(0x0800_0000);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("spawn {}: {e}", node.display()))?;
    Ok((port, child))
}

/// Poll 127.0.0.1:port until the server answers (the standalone server boots
/// in a few seconds; 150 × 400 ms ≈ 60 s of budget, Electron allows more).
/// connect_timeout keeps a wedged poll from hanging on an OS-level default.
fn wait_ready(port: u16) -> bool {
    for _ in 0..150 {
        if TcpStream::connect_timeout(("127.0.0.1", port), Duration::from_millis(400)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    false
}

/**
 * The window-controls shim. The React app talks to `window.resonaDesktop`
 * (the Electron preload contract). In the Tauri shell the same surface is
 * mapped onto Tauri commands over the global Tauri API (withGlobalTauri).
 * `mpv` is deliberately ABSENT: `mpvBridge()` in player-engine.ts returns
 * null and the HTML5 ladder plays everything — the v1.7.8-fixed path.
 * Taskbar thumbar buttons are an Electron-specific Windows API — stubbed.
 */
const SHIM_JS: &str = r#"
(function () {
  if (window.__resonaDesktopShimmed) return;
  window.__resonaDesktopShimmed = true;
  var T = window.__TAURI__;
  if (!T || !T.core) return;
  var invoke = T.core.invoke;
  window.resonaDesktop = {
    minimize: function () { invoke("win_minimize"); },
    toggleMaximize: function () { invoke("win_toggle_max"); },
    close: function () { invoke("win_close"); },
    isMaximized: function () { return invoke("win_is_max"); },
    onMaximizeChange: function (cb) {
      var un = null;
      T.event.listen("win:max-changed", function (e) { cb(e.payload); })
        .then(function (f) { un = f; });
      return function () { if (un) un(); };
    },
    /* Electron-only Windows taskbar thumbar — safe no-ops here */
    setThumbarState: function () {},
    onThumbarAction: function () { return function () {}; },
  };
})();
"#;

#[tauri::command]
fn win_minimize(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

#[tauri::command]
fn win_toggle_max(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let maxed = w.is_maximized().unwrap_or(false);
        if maxed {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

#[tauri::command]
fn win_close(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    }
}

#[tauri::command]
fn win_is_max(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}

/// The splash (and anything else on the bundled origin) can ask where the
/// server lives and navigate itself once it answers.
#[tauri::command]
fn server_url(state: State<'_, ServerState>) -> String {
    format!("http://127.0.0.1:{}", state.port.load(Ordering::Relaxed))
}

/// Splash readiness probe — answered by RUST, not by the webview.
///
/// v1.7.10 had the splash fetch() `http://127.0.0.1:<port>/` itself: from
/// the bundled page (tauri://localhost / http://tauri.localhost) that is a
/// CROSS-ORIGIN request, and the Next standalone server sends no
/// Access-Control-Allow-Origin header, so the fetch rejected forever even
/// while the server was perfectly up — the splash spun on "Starting the
/// music server…" for two minutes, then reported a failure that never
/// happened. A TCP connect from the Rust side has no origin, so no CORS
/// applies; this is the only reliable readiness signal from the webview.
#[tauri::command]
fn server_ready(state: State<'_, ServerState>) -> bool {
    let port = state.port.load(Ordering::Relaxed);
    if port == 0 {
        return false; // spawn hasn't chosen a port yet
    }
    TcpStream::connect_timeout(("127.0.0.1", port), Duration::from_millis(250)).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            win_minimize,
            win_toggle_max,
            win_close,
            win_is_max,
            server_url,
            server_ready
        ])
        .setup(|app| {
            app.manage(ServerState {
                port: AtomicU16::new(0),
                child: Mutex::new(None),
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        RunEvent::Ready => {
            let app = app.clone();
            std::thread::spawn(move || {
                // open the bundled splash FIRST so the user sees a window
                // immediately, not a dead-looking silent process; the splash
                // polls server_url and navigates itself to the app
                open_window(&app);
                let resource_base = match app.path().resource_dir() {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("resource_dir failed: {e}");
                        return;
                    }
                };
                match spawn_server(&resource_base) {
                    Ok((port, child)) => {
                        if let Some(state) = app.try_state::<ServerState>() {
                            state.port.store(port, Ordering::Relaxed);
                            if let Ok(mut g) = state.child.lock() {
                                *g = Some(child);
                            }
                        }
                        if wait_ready(port) {
                            // push the URL to the splash — no polling latency
                            // for the user; the splash also polls server_ready
                            // as a fallback in case it loads after this fires
                            let url = format!("http://127.0.0.1:{port}");
                            let _ = app.emit("server-ready", url);
                        } else {
                            eprintln!("server did not start in time on port {port}");
                        }
                    }
                    Err(e) => eprintln!("server spawn failed: {e}"),
                }
            });
        }
        RunEvent::Exit => {
            // kill the server child so it never outlives the shell
            if let Some(state) = app.try_state::<ServerState>() {
                if let Ok(mut g) = state.child.lock() {
                    if let Some(c) = g.as_mut() {
                        let _ = c.kill();
                    }
                }
            }
        }
        _ => {}
    });
}

/// Open the frameless main window on the bundled splash page. The splash
/// polls `server_url` and navigates to the real app once the server answers.
fn open_window(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        return;
    }
    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Resona")
        .decorations(false)
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 640.0)
        .initialization_script(SHIM_JS);
    let win = match builder.build() {
        Ok(w) => w,
        Err(e) => {
            eprintln!("window build failed: {e}");
            return;
        }
    };
    // frameless window: forward maximize state so the custom header's
    // maximize button can flip its glyph (Electron does the same IPC)
    let w = win.clone();
    win.on_window_event(move |e| {
        if let WindowEvent::Resized(_) = e {
            let _ = w.emit("win:max-changed", w.is_maximized().unwrap_or(false));
        }
    });
}
