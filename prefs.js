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
    _bindColorButtons(settings, builder);
}

function _bindSwitches(settings, builder) {
    const switches = [
        'scale',
        'darken',
        'border',
        'scale-focus',
    ];

    switches.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
    });
}

function _bindSpinbuttons(settings, builder) {
    const spinButtons = [
        'starting-scale',
        'scale-delay',
        'scale-duration',
        'darken-delay',
        'darken-duration',
        'border-size',
        'border-delay',
        'border-duration',
        'starting-scale-focus',
        'scale-delay-focus',
        'scale-duration-focus'
    ];

    spinButtons.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        if (!widget) log(key)
        settings.bind(key, widget, 'value', Gio.SettingsBindFlags.DEFAULT);
    });
}

function _bindComboRows(settings, builder) {
    const comboRows = [
        'scale-mode',
        'darken-mode',
        'border-mode',
        'scale-mode-focus'
    ];

    comboRows.forEach(key => {
        const widget = builder.get_object(key.replaceAll('-', '_'));
        settings.bind(key, widget, 'selected', Gio.SettingsBindFlags.DEFAULT);
        widget.set_selected(settings.get_int(key));
    });
}

function _bindColorButtons(settings, builder) {
    const colorButtons = [
        'darken-color',
        'border-color'
    ];

    colorButtons.forEach(key => {
        const widget = builder.get_object(`${key.replaceAll('-', '_')}_button`);
        widget.connect('color-set', () => {
            settings.set_string(key, widget.get_rgba().to_string());
        });

        // initilaize color
        const rgba = new Gdk.RGBA();
        rgba.parse(settings.get_string(key));
        widget.set_rgba(rgba);
    });
}
