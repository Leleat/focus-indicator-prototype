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

    _bindSpinbuttons(settings, builder);
    _bindComboRows(settings, builder);
}

function _bindSpinbuttons(settings, builder) {
    const spinButtons = [
        'starting-scale-focus',
        'scale-delay-focus',
        'scale-duration-focus',
        'app-switcher-up-scale',
        'app-switcher-up-delay',
        'app-switcher-up-duration',
        'app-switcher-down-delay',
        'app-switcher-down-duration'
    ];

    spinButtons.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        if (!widget) log(key)
        settings.bind(key, widget, 'value', Gio.SettingsBindFlags.DEFAULT);
    });
}

function _bindComboRows(settings, builder) {
    const comboRows = [
        'scale-mode-focus',
        'app-switcher-up-mode',
        'app-switcher-down-mode'
    ];

    comboRows.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        settings.bind(key, widget, 'selected', Gio.SettingsBindFlags.DEFAULT);
        widget.set_selected(settings.get_int(key));
    });
}

