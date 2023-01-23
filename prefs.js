'use strict';

const { Gdk, Gio, Gtk } = imports.gi;

function init() {
}

function fillPreferencesWindow(window) {
    const ExtensionUtils = imports.misc.extensionUtils;
    const Me = ExtensionUtils.getCurrentExtension();

    const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
    const builder = new Gtk.Builder();
    builder.add_from_file(`${Me.path}/prefs.ui`);

    window.add(builder.get_object('general'));

    _bindSwitches(settings, builder);
    _bindSpinbuttons(settings, builder);
    _bindComboRows(settings, builder);
}

function _bindSwitches(settings, builder) {
    const switches = [
        'hide-app-menu'
    ];

    switches.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
    });
}

function _bindSpinbuttons(settings, builder) {
    const spinButtons = [
        'scale-to',
        'anim-up-delay',
        'anim-up-duration',
        'anim-down-delay',
        'anim-down-duration',
        'workspace-switch-delay',
        'idle-time'
    ];

    spinButtons.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        if (!widget) log(key)
        settings.bind(key, widget, 'value', Gio.SettingsBindFlags.DEFAULT);
    });
}

function _bindComboRows(settings, builder) {
    const comboRows = [
        'anim-up-mode',
        'anim-down-mode'
    ];

    comboRows.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        settings.bind(key, widget, 'selected', Gio.SettingsBindFlags.DEFAULT);
        widget.set_selected(settings.get_int(key));
    });
}

