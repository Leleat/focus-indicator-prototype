'use strict';

const { Gio, Meta, Shell } = imports.gi;
const { main: Main } = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { FocusIndicator } = Me.imports.src.focusIndicator;

var CustomSwitchToApplication = class CustomSwitchToApplication {
    constructor() {
        for (let i = 1; i < 10; i++) {
            const key = `switch-to-application-${i}`;
            if (global.display.remove_keybinding(key)) {
                global.display.add_keybinding(
                    key,
                    new Gio.Settings({ schema_id: 'org.gnome.shell.keybindings' }),
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    this._customSwitchToApplication.bind(this)
                );
            }
        }
    }

    destroy() {
        for (let i = 1; i < 10; i++) {
            const key = `switch-to-application-${i}`;
            if (global.display.remove_keybinding(key)) {
                Main.wm.addKeybinding(
                    key,
                    new Gio.Settings({ schema_id: 'org.gnome.shell.keybindings' }),
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL |
                    Shell.ActionMode.OVERVIEW,
                    Main.wm._switchToApplication.bind(Main.wm));
            }
        }
    }

    _customSwitchToApplication(_, window, binding) {
        if (!Main.sessionMode.hasOverview)
            return;

        const [, , , target] = binding.get_name().split('-');
        const AppFavorites = imports.ui.appFavorites;
        const apps = AppFavorites.getAppFavorites().getFavorites();
        const app = apps[target - 1];

        if (app) {
            const windows = app.get_windows();
            const windowExisted = windows.length > 0;
            const activeWs = global.workspace_manager.get_active_workspace();

            const focusIndicator = FocusIndicator.getInstance();
            const focus = windows[0];
            // workspaceAnimation
            if (focus && activeWs !== focus.get_workspace())
                focusIndicator.focus = focus;
            else if (windowExisted && activeWs === focus.get_workspace())
                focusIndicator.indicate({ focus });

            Main.overview.hide();
            app.activate();
        }
    }
}
