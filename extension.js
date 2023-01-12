/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
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

/* exported init */

'use strict';

const { main: Main } = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { FocusIndicator } = Me.imports.src.focusIndicator;
const { CustomAppSwitcher } = Me.imports.src.altTab;
const { CustomWorkspaceAnimation } = Me.imports.src.workspaceAnimation;
const { CustomSwitchToApplication } = Me.imports.src.switchToApplication;

class Extension {
    constructor() {
    }

    enable() {
        this._focusIndicator = FocusIndicator.getInstance();
        this._customAppSwitcher = new CustomAppSwitcher();
        this._customWorkspaceAnimation = new CustomWorkspaceAnimation();
        this._customSwitchToApplication = new CustomSwitchToApplication();

        Main.panel.statusArea['appMenu'].container.hide();

        if (this._wasLocked) {
            this._unlockId = Main.screenShield.actor.connect('hide', () => {
                Main.screenShield.actor.disconnect(this._unlockId);
                this._unlockId = 0;

                const focus = global.display.focus_window;
                this._focusIndicator.indicate({ focus });
            });

            this._wasLocked = false;
        }
    }

    disable() {
        this._unlockId && Main.screenShield.actor.disconnect(this._unlockId);
        this._unlockId = 0;

        this._customSwitchToApplication.destroy();
        this._customSwitchToApplication = null;

        this._customWorkspaceAnimation.destroy();
        this._customWorkspaceAnimation = null;

        this._customAppSwitcher.destroy();
        this._customAppSwitcher = null;

        this._focusIndicator.destroy();
        this._focusIndicator = null;

        // Looks like g-s updates the top panel after the extensions are disabled
        // so we want to exit early here otherwise the appMenu will be shown on
        // the lockscreen while the extension is enabled...
        if (Main.sessionMode.isLocked) {
            this._wasLocked = true;
            return;
        }

        Main.panel.statusArea['appMenu'].container.show();
    }
}

function init() {
    return new Extension();
}
