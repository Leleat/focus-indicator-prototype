'use strict';

const { Clutter, Graphene } = imports.gi;
const { altTab: AltTab, main: Main, switcherPopup: SwitcherPopup } = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { FocusIndicator } = Me.imports.src.focusIndicator;

var CustomAppSwitcher = class CustomAppSwitcher {
    constructor() {
        this._appSwitcherFinish = AltTab.AppSwitcherPopup.prototype._finish;
        this._override();
    }

    destroy() {
        AltTab.AppSwitcherPopup.prototype._finish = this._appSwitcherFinish;
        this._appSwitcherFinish = null;
    }

    _override() {
        AltTab.AppSwitcherPopup.prototype._finish = function(timestamp) {
            const activeWs = global.workspace_manager.get_active_workspace();
            const appIcon = this._items[this._selectedIndex];
            const focus = this._currentWindow < 0
                ? appIcon.cachedWindows[0]
                : appIcon.cachedWindows[this._currentWindow];

            const focusIndicator = FocusIndicator.getInstance();
            // workspaceAnimation
            if (activeWs !== focus.get_workspace())
                focusIndicator.focus = focus;
            else
                focusIndicator.indicate({ focus });

            if (this._currentWindow < 0)
                appIcon.app.activate_window(focus, timestamp);
            else if (appIcon.cachedWindows[this._currentWindow])
                Main.activateWindow(focus, timestamp);

            SwitcherPopup.SwitcherPopup.prototype._finish.call(this, timestamp);
        }
    }
}
