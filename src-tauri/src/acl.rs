//! Check the packaged permissions against the same resolver Tauri uses for IPC.

#[cfg(test)]
mod tests {
    use tauri::ipc::Origin;

    const COMPANION: [&str; 40] = ["core_endpoint", "companion_monitors", "companion_place", "companion_hit_rects", "companion_media",
        "companion_media_control", "companion_media_levels", "companion_configure", "companion_drag", "companion_capture", "companion_cover", "companion_focus",
        "companion_keep", "island_place", "bots_settings", "bots_tray_labels", "plugin:event|listen", "plugin:event|unlisten",
        "computer_system", "computer_close", "computer_power", "computer_apps", "computer_app_icon", "computer_app_open", "computer_link_open", "computer_clipboard_watch",
        "computer_clipboard_list", "computer_clipboard_copy", "computer_clipboard_remove", "computer_clipboard_item", "computer_wallpapers",
        "computer_wallpaper_folder", "computer_wallpaper_pick", "computer_wallpaper_thumb", "computer_wallpaper_set", "computer_engine",
        "computer_engine_thumb", "computer_engine_apply", "computer_engine_current", "computer_engine_control"];

    fn handlers() -> Vec<&'static str> {
        let list = include_str!("lib.rs").split("tauri::generate_handler![").nth(1).unwrap().split("])").next().unwrap();
        list.split(',').map(str::trim).filter(|s| !s.is_empty()).map(|handler| handler.rsplit("::").next().unwrap()).collect()
    }

    #[test]
    fn every_command_is_granted_to_the_companion_and_none_to_a_remote_page() {
        let mut context: tauri::Context<tauri::test::MockRuntime> = crate::bots_context();
        let authority = context.runtime_authority_mut();
        let remote = Origin::Remote { url: "https://example.test/".parse().unwrap() };
        for command in handlers() {
            assert!(COMPANION.contains(&command), "{command} is not in the companion's list");
            assert!(authority.resolve_access(command, "companion", "companion", &Origin::Local).is_some(), "{command} not allowed by ACL");
            assert!(authority.resolve_access(command, "companion", "companion", &remote).is_none(), "{command} granted to a remote origin");
            assert!(authority.resolve_access(command, "other", "other", &Origin::Local).is_none(), "{command} granted to another webview");
        }
        for command in COMPANION {
            assert!(authority.resolve_access(command, "companion", "companion", &Origin::Local).is_some(), "companion cannot invoke {command}");
        }
    }

    #[test]
    fn the_settings_live_in_the_companion_and_no_settings_webview_is_granted_anything() {
        let mut context: tauri::Context<tauri::test::MockRuntime> = crate::bots_context();
        let authority = context.runtime_authority_mut();
        for command in COMPANION {
            assert!(authority.resolve_access(command, "settings", "settings", &Origin::Local).is_none(), "a settings webview can invoke {command}");
        }
    }
}
