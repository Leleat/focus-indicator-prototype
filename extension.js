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
    }

    disable() {
        this._customSwitchToApplication.destroy();
        this._customSwitchToApplication = null;

        this._customWorkspaceAnimation.destroy();
        this._customWorkspaceAnimation = null;

        this._customAppSwitcher.destroy();
        this._customAppSwitcher = null;

        this._focusIndicator.destroy();
        this._focusIndicator = null;
    }
}

function init() {
    return new Extension();
}
