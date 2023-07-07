/* prefs.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported fillPreferencesWindow, init */

'use strict';

const {Gdk, Gio, Gtk} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

/** */
function init() {}

/**
 * Fills the preference window of the extension. This function is called by
 * GNOME Shell's extension system.
 *
 * @param {Adw.PreferencesWindow} window -
 */
function fillPreferencesWindow(window) {
    window.set_can_navigate_back(true);

    const settings = ExtensionUtils.getSettings();
    const builder = new Gtk.Builder();

    builder.add_from_file(`${Me.path}/prefs.ui`);

    window.add(builder.get_object('page-general'));

    _bindRadioButtons(builder, settings);
}

/**
 * Binds radioButtons to gsettings. The radioButtons are basically just used as
 * a _fake ComboBox_ with explanations for the different options. There is _one_
 * gsetting (an int) which saves the current _selection_.
 *
 * @param {Gtk.Builder} builder -
 * @param {Gio.Settings} gioSettings -
 */
function _bindRadioButtons(builder, gioSettings) {
    const radioButtons = [
        {
            gsetting: 'focus-hint',
            buttons: [
                'disabled-focus-hint-button',
                'animated-outline-focus-hint-button',
                'animated-upscale-focus-hint-button',
                'static-outline-focus-hint-button',
            ],
        },
    ];

    radioButtons.forEach(({gsetting, buttons}) => {
        const currentSelection = gioSettings.get_int(gsetting);

        buttons.forEach((buttonId, idx) => {
            const button = builder.get_object(buttonId);

            button.connect('toggled', () => gioSettings.set_int(gsetting, idx));

            if (idx === currentSelection) {
                button.activate();
            }
        });
    });
}
