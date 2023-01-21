'use strict';

const { Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { FocusIndicator } = Me.imports.src.focusIndicator;

var IdleIndicator = class IdleIndicator {
    constructor() {
        this._settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
        this._idleMonitor = global.backend.get_core_idle_monitor();

        this._addIdleWatcher();
        this._settings.connect('changed::idle-time', () => this._addIdleWatcher());
    }

    destroy() {
        this._settings.run_dispose();
        this._settings = null;

        this._idleMonitor.remove_watch(this._idleID);
        this._idleID = 0;

        this._activeID && this._idleMonitor.remove_watch(this._activeID);
        this._activeID = 0;

        this._idleMonitor = null;
    }

    _addIdleWatcher() {
        const idleTime = this._settings.get_int('idle-time') * 1000;

        this._activeID && this._idleMonitor.remove_watch(this._activeID);
        this._activeID = 0;
        this._idleID && this._idleMonitor.remove_watch(this._idleID);
        this._idleID = 0;

        this._idleID = this._idleMonitor.add_idle_watch(idleTime, () => {
            this._activeID = this._idleMonitor.add_user_active_watch(() => {
                this._activeID = 0;

                const focusIndicator = FocusIndicator.getInstance();
                focusIndicator.indicate({ focus: global.display.focus_window });
            });
        });
    }
}
