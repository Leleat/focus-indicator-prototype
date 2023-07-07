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

const {Clutter, Gio, GLib, Meta, Shell, St} = imports.gi;
const {
    altTab: AltTab,
    appFavorites: AppFavorites,
    main: Main,
    osdWindow: OsdWindow,
    switcherPopup: SwitcherPopup,
} = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {
    return new Extension();
}

class Extension {
    _focusHintManager;

    enable() {
        if (this._wasLocked) {
            Main.screenShield.actor.connectObject(
                'hide',
                () => {
                    Main.screenShield.actor.disconnectObject(this);

                    clearTimeout(this._fallbackTimer);

                    this._focusHintManager = new FocusHintManager(
                        global.display.focus_window
                    );
                },
                this
            );

            this._fallbackTimer = setTimeout(
                () => {
                    Main.screenShield.actor.disconnectObject(this);
                    this._focusHintManager = new FocusHintManager();
                },
                2000
            );
        } else {
            this._focusHintManager = new FocusHintManager();
        }
    }

    disable() {
        clearTimeout(this._fallbackTimer);

        this._focusHintManager.destroy();
        this._focusHintManager = null;

        this._wasLocked = Main.sessionMode.isLocked;
    }
}

const FocusHintManager = class {
    _hint = null;
    _settings = null;

    constructor(initialWindow) {
        this._settings = ExtensionUtils.getSettings();

        this._settings.connectObject(
            'changed::focus-hint',
            () => this._setHint(),
            this
        );
        this._setHint();

        if (this._hint?.shouldIndicate(initialWindow)) {
            this._hint.indicate(initialWindow);
        }
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._settings = null;

        this._hint?.destroy();
        this._hint = null;
    }

    _setHint() {
        this._hint?.destroy();

        // Values are determined by the order in prefs.js.
        switch (this._settings.get_int('focus-hint')) {
            case 1:
                this._hint = new AnimatedOutlineHint();
                break;
            case 2:
                this._hint = new AnimatedUpscaleHint();
                break;
            case 3:
                this._hint = new StaticOutlineHint();
                break;
            default:
                this._hint = null;
        }
    }
};

class Hint {
    _actors = [];

    constructor() {
        this._addIdleWatcher();
        this._overrideSwitchToApplication();
        this._overrideSwitcherPopupFinish();
        this._overrideWorkspaceAnimationSwitch();
        this._indicateOnWindowClose();

        Main.wm._workspaceAnimation._swipeTracker.connectObject(
            'begin',
            () => this.resetAnimation(),
            'end',
            (_, duration, endProgress) =>
                this._onSwipeGestureEnd(_, duration, endProgress),
            this
        );
    }

    destroy() {
        if (this._workspaceSwitchTimer) {
            clearTimeout(this._workspaceSwitchTimer);
            this._workspaceSwitchTimer = 0;
        }

        this.resetAnimation();

        Main.wm._workspaceAnimation._swipeTracker.disconnectObject(this);

        this._stopIndicatingOnWindowClose();
        this._restoreSwitcherPopupFinish();
        this._restoreSwitchToApplication();
        this._restoreWorkspaceAnimationSwitch();
        this._removeIdleWatcher();
    }

    indicate() {
        throw new Error('`indicate` not implemented by Hint subclass!');
    }

    resetAnimation() {
        this._actors.forEach(actor => actor.destroy());
        this._actors = [];
    }

    _addIdleWatcher() {
        const idleMonitor = global.backend.get_core_idle_monitor();
        const idleTime = 120 * 1000;

        this._activeWatchId && idleMonitor.remove_watch(this._activeWatchId);
        this._activeWatchId = 0;

        this._idleWatchId && idleMonitor.remove_watch(this._idleWatchId);
        this._idleWatchId = idleMonitor.add_idle_watch(idleTime, () => {
            this._activeWatchId = idleMonitor.add_user_active_watch(() => {
                this._activeWatchId = 0;

                const focus = global.display.focus_window;

                if (this.shouldIndicate(focus)) {
                    this.indicate(focus);
                }
            });
        });
    }

    /**
     * Determines whether a window type should be indicated.
     *
     * @param {Meta.WindowType} type -
     * @returns {boolean}
     */
    _allowsWindowType(type) {
        return [
            Meta.WindowType.NORMAL,
            Meta.WindowType.DIALOG,
            Meta.WindowType.MODAL_DIALOG,
        ].includes(type);
    }

    _createContainers(
        window,
        workspaceAnimationWindowClone,
        workspaceSwitchAnimationDuration
    ) {
        const offset = this._getWorkspaceAnimationOffset(
            workspaceAnimationWindowClone,
            window.get_compositor_private()
        );

        const monitorRect = global.display.get_monitor_geometry(
            window.get_monitor()
        );
        const monitorContainer = new Clutter.Actor({
            clip_to_allocation: true,
            x: monitorRect.x,
            y: monitorRect.y,
            width: monitorRect.width,
            height: monitorRect.height,
        });

        // Allow tiled window to be animate above the panel. Also, When changing
        // workspaces we want to put everything above the animating clones.
        if (workspaceAnimationWindowClone) {
            const osdWindow = Main.uiGroup
                .get_children()
                .find(child => child instanceof OsdWindow.OsdWindow);

            if (osdWindow) {
                Main.uiGroup.insert_child_below(monitorContainer, osdWindow);
            } else {
                Main.uiGroup.add_child(monitorContainer);
            }
        } else {
            global.window_group.add_child(monitorContainer);
        }

        this._actors.push(monitorContainer);

        const workspaceContainer = new Clutter.Actor({
            x: offset.x,
            y: offset.y,
            width: monitorContainer.width,
            height: monitorContainer.height,
        });

        monitorContainer.add_child(workspaceContainer);

        workspaceContainer.ease({
            x: 0,
            y: 0,
            duration: workspaceSwitchAnimationDuration,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });

        return [monitorContainer, workspaceContainer];
    }

    _createWindowClone(windowActor, monitorContainer) {
        const monitor = windowActor.get_meta_window().get_monitor();
        const {x, y} = this._getAbsPos(windowActor, monitor);

        const windowClone = new Clutter.Clone({
            source: windowActor,
            x: x - monitorContainer.x,
            y: y - monitorContainer.y,
            width: windowActor.width,
            height: windowActor.height,
        });

        return windowClone;
    }

    // get_transformed_position doesnt work as I expected it to...
    _getAbsPos(actor, monitor) {
        const monitorRect = global.display.get_monitor_geometry(monitor);
        const pos = {x: actor.x, y: actor.y};
        let parent = actor.get_parent();

        while (parent) {
            pos.x += parent.x;
            pos.y += parent.y;

            parent = parent.get_parent();
        }

        pos.x += monitorRect.x;
        pos.y += monitorRect.y;

        return pos;
    }

    // may be null if focus on secondary monitor with 'WS only on primary display'
    _getWindowCloneForWorkspaceAnimation(
        windowActor,
        animatingWorkspaceSwitch
    ) {
        if (!animatingWorkspaceSwitch) {
            return null;
        }

        const switchData = Main.wm._workspaceAnimation._switchData;
        let clone = null;

        switchData.monitors.find(monitorGroup => {
            return monitorGroup._workspaceGroups.find(workspaceGroup => {
                return workspaceGroup._windowRecords.find(record => {
                    const foundClone = record.windowActor === windowActor;

                    if (foundClone) {
                        ({clone} = record);
                    }

                    return foundClone;
                });
            });
        });

        return clone;
    }

    _getWorkspaceAnimationOffset(workspaceAnimationWindowClone, windowActor) {
        if (!workspaceAnimationWindowClone) {
            return {x: 0, y: 0};
        }

        const monitor = windowActor.get_meta_window().get_monitor();
        const windowActorAbsPos = this._getAbsPos(windowActor, monitor);
        const animatingWindowCloneAbsPos = this._getAbsPos(
            workspaceAnimationWindowClone,
            monitor
        );

        return {
            x: animatingWindowCloneAbsPos.x - windowActorAbsPos.x,
            y: animatingWindowCloneAbsPos.y - windowActorAbsPos.y,
        };
    }

    _indicateOnWindowClose() {
        global.display.connectObject(
            'window-created',
            (_, metaWindow) => this._onWindowCreated(metaWindow),
            this
        );

        global
            .get_window_actors()
            .forEach(actor => this._onWindowCreated(actor.get_meta_window()));
    }

    _onSwipeGestureEnd(swipeTracker, duration, endProgress) {
        const switchData = Main.wm._workspaceAnimation._switchData;

        // No switchData, if there is nothing to animate; for instance if the
        // swipe gesture was big enough to fully lead to the new workspace.
        if (!switchData) {
            this.indicate(global.display.focus_window);
            return;
        }

        const [monitorGroup] = switchData.monitors;
        const transition = monitorGroup?.get_transition('progress');

        if (!transition) {
            return;
        }

        const newWs =
            switchData.baseMonitorGroup.findClosestWorkspace(endProgress);
        const [window] = AltTab.getWindows(newWs);

        if (!window || !this.shouldIndicate(window)) {
            return;
        }

        // The animation for workspace switching with swipe gestures is
        // variable. It seems like it can range from 100-400 ms. When switching
        // workspaces with shortcuts, the focus indication starts at 175 ms of
        // the 250 ms animation. So try to make it feel similiar for swiping.
        transition.add_marker_at_time(
            'start_focus_indication',
            (175 / 250) * transition.get_duration()
        );
        transition.connect('marker-reached', (_, marker, msecs) => {
            if (marker !== 'start_focus_indication') {
                return;
            }

            const workspaceAnimationWindowClone =
                this._getWindowCloneForWorkspaceAnimation(window.actor, true);

            if (workspaceAnimationWindowClone) {
                this.indicate(window, transition.get_duration() - msecs);
            } else {
                this.indicate(window);
            }
        });
    }

    _onWindowCreated(window) {
        if (!this._allowsWindowType(window.get_window_type())) {
            return;
        }

        window.connectObject(
            'unmanaged',
            () => {
                window.disconnectObject(this);

                const focus = global.display.focus_window;

                if (focus && this.shouldIndicate(focus)) {
                    this.indicate(focus);
                }
            },
            this
        );
    }

    _overrideSwitcherPopupFinish() {
        this._originalSwitcherPopupFinish =
            SwitcherPopup.SwitcherPopup.prototype._finish;

        const that = this;

        SwitcherPopup.SwitcherPopup.prototype._finish = function (timestamp) {
            that._originalSwitcherPopupFinish.call(this, timestamp);

            const newFocus = global.display.focus_window;

            if (that.shouldIndicate(newFocus)) {
                if (that._workspaceSwitchTimer) {
                    clearTimeout(that._workspaceSwitchTimer);
                    that._workspaceSwitchTimer = 0;
                }

                that.indicate(newFocus);
            }
        };
    }

    _overrideSwitchToApplication() {
        for (let i = 1; i < 10; i++) {
            const key = `switch-to-application-${i}`;

            if (global.display.remove_keybinding(key)) {
                const handler = (_, __, keybinding) => {
                    if (!Main.sessionMode.hasOverview) {
                        return;
                    }

                    const [, , , target] = keybinding.get_name().split('-');
                    const apps = AppFavorites.getAppFavorites().getFavorites();
                    const app = apps[target - 1];

                    if (app) {
                        const [newFocus] = app.get_windows();

                        Main.overview.hide();
                        app.activate();

                        if (this.shouldIndicate(newFocus)) {
                            if (this._workspaceSwitchTimer) {
                                clearTimeout(this._workspaceSwitchTimer);
                                this._workspaceSwitchTimer = 0;
                            }

                            this.indicate(newFocus);
                        }
                    }
                };

                global.display.add_keybinding(
                    key,
                    new Gio.Settings({
                        schema_id: 'org.gnome.shell.keybindings',
                    }),
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    handler
                );
            }
        }
    }

    _overrideWorkspaceAnimationSwitch() {
        this._originalWorkspaceAnimationSwitch =
            Main.wm._workspaceAnimation.animateSwitch;

        const that = this;

        Main.wm._workspaceAnimation.animateSwitch = function (
            from,
            to,
            direction,
            onComplete
        ) {
            that._originalWorkspaceAnimationSwitch.call(
                this,
                from,
                to,
                direction,
                onComplete
            );

            // This is set if the focused window moved to the new workspace
            // along with the workspace switch animation. E. g. when using
            // Shift + Super + Alt + Arrow_Keys.
            if (this.movingWindow) {
                return;
            }

            // There are 2 different 'focus behaviors' during a workspace
            // animation. 1: When the workspace switch is initiated by an app or
            // by a window activation/focus (e. g. App Switcher). In this case
            // global.display.focus_window gives the correct window for the
            // focus hint. 2: When just switching workspaces (e. g. Super + Alt
            // + Arrow Key), here the focus switches *after* the animation. So
            // delay this code and let it be interrupted by the switcher popup
            // or the switch-to-application focus hint.
            that._workspaceSwitchTimer = setTimeout(() => {
                that._workspaceSwitchTimer = 0;

                const newWorkspace =
                    global.workspace_manager.get_workspace_by_index(to);
                const [newFocus] = AltTab.getWindows(newWorkspace);

                if (that.shouldIndicate(newFocus)) {
                    that.indicate(newFocus);
                }
            });
        };
    }

    shouldIndicate(window) {
        if (!window || !window.get_compositor_private()) {
            return false;
        }

        if (!this._allowsWindowType(window.get_window_type())) {
            return false;
        }

        if (
            window.is_fullscreen() ||
            window.get_maximized() === Meta.MaximizeFlags.BOTH
        ) {
            return false;
        }

        return true;
    }

    _removeIdleWatcher() {
        const idleMonitor = global.backend.get_core_idle_monitor();

        this._activeWatchId && idleMonitor.remove_watch(this._activeWatchId);
        this._activeWatchId = 0;

        this._idleWatchId && idleMonitor.remove_watch(this._idleWatchId);
        this._idleWatchId = 0;
    }

    _restoreSwitcherPopupFinish() {
        SwitcherPopup.SwitcherPopup.prototype._finish =
            this._originalSwitcherPopupFinish;

        this._originalSwitcherPopupFinish = null;
    }

    _restoreSwitchToApplication() {
        for (let i = 1; i < 10; i++) {
            const key = `switch-to-application-${i}`;

            if (global.display.remove_keybinding(key)) {
                Main.wm.addKeybinding(
                    key,
                    new Gio.Settings({
                        schema_id: 'org.gnome.shell.keybindings',
                    }),
                    Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                    Main.wm._switchToApplication.bind(Main.wm)
                );
            }
        }
    }

    _restoreWorkspaceAnimationSwitch() {
        Main.wm._workspaceAnimation.animateSwitch =
            this._originalWorkspaceAnimationSwitch;

        this._originalWorkspaceAnimationSwitch = null;
    }

    _stopIndicatingOnWindowClose() {
        global.display.disconnectObject(this);

        global
            .get_window_actors()
            .forEach(actor => {
                actor.get_meta_window().disconnectObject(this);
            });
    }
}

class AnimatedOutlineHint extends Hint {
    _outlineWidth = 10;

    /**
     *
     * @param {Window} window -
     * @param {number} workspaceSwitchAnimationDuration -
     */
    indicate(window, workspaceSwitchAnimationDuration = 250) {
        this.resetAnimation();

        if (!this.shouldIndicate(window)) {
            return;
        }

        const windowActor = window.get_compositor_private();
        const workspaceAnimationWindowClone =
            this._getWindowCloneForWorkspaceAnimation(
                windowActor,
                !!Main.wm._workspaceAnimation._switchData
            );
        const [monitorContainer, workspaceContainer] = this._createContainers(
            window,
            workspaceAnimationWindowClone,
            workspaceSwitchAnimationDuration
        );
        const customClone = this._createWindowClone(
            windowActor,
            monitorContainer
        );
        const outline = this._createOutline(window, monitorContainer);
        const {
            x: windowFrameX,
            y: windowFrameY,
            width: windowFrameWidth,
            height: windowFrameHeight,
        } = window.get_frame_rect();

        workspaceContainer.add_child(outline);
        workspaceContainer.add_child(customClone);

        workspaceAnimationWindowClone?.hide();

        outline.ease({
            x: windowFrameX - monitorContainer.x - this._outlineWidth,
            y: windowFrameY - monitorContainer.y - this._outlineWidth,
            width: windowFrameWidth + 2 * this._outlineWidth,
            height: windowFrameHeight + 2 * this._outlineWidth,
            delay: workspaceAnimationWindowClone
                ? (175 / 250) * workspaceSwitchAnimationDuration
                : 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
            onComplete: () => {
                outline.ease({
                    x: windowFrameX - monitorContainer.x,
                    y: windowFrameY - monitorContainer.y,
                    width: windowFrameWidth,
                    height: windowFrameHeight,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_IN,
                    onComplete: () => this.resetAnimation(),
                });
            },
        });
    }

    _createOutline(window, monitorContainer) {
        const {x, y, width, height} = window.get_frame_rect();
        const outline = new St.Widget({
            style: `
                background-color: #3d99ff;
                border-radius: 18px;
            `,
            x: x - monitorContainer.x,
            y: y - monitorContainer.y,
            width,
            height,
        });

        return outline;
    }
}

class AnimatedUpscaleHint extends Hint {
    _scaleAmount = 10;

    /**
     *
     * @param {Window} window -
     * @param {number} workspaceSwitchAnimationDuration -
     */
    indicate(window, workspaceSwitchAnimationDuration = 250) {
        this.resetAnimation();

        if (!this.shouldIndicate(window)) {
            return;
        }

        const windowActor = window.get_compositor_private();
        const workspaceAnimationWindowClone =
            this._getWindowCloneForWorkspaceAnimation(
                windowActor,
                !!Main.wm._workspaceAnimation._switchData
            );
        const [monitorContainer, workspaceContainer] = this._createContainers(
            window,
            workspaceAnimationWindowClone,
            workspaceSwitchAnimationDuration
        );
        const customClone = this._createWindowClone(
            windowActor,
            monitorContainer
        );
        const {x, y, width, height} = customClone;

        workspaceContainer.add_child(customClone);

        workspaceAnimationWindowClone?.hide();
        windowActor.set_opacity(0); // Hide to prevent double shadows.

        customClone.ease({
            x: x - this._scaleAmount,
            y: y - this._scaleAmount,
            width: width + 2 * this._scaleAmount,
            height: height + 2 * this._scaleAmount,
            delay: workspaceAnimationWindowClone
                ? (175 / 250) * workspaceSwitchAnimationDuration
                : 0,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                customClone.ease({
                    x,
                    y,
                    width,
                    height,
                    duration: 150,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => this.resetAnimation(),
                });
            },
        });
    }

    resetAnimation() {
        global.get_window_actors().forEach(a => a.set_opacity(255));
        super.resetAnimation();
    }
}

class StaticOutlineHint extends AnimatedOutlineHint {
    /** @type {St.Widget} */
    _outline = null;

    /** @type {Meta.Window|null} */
    _window = null;

    _outlineWidth = 10;

    constructor() {
        super();

        this._outline = new St.Widget({
            style: `
                border: ${2 * this._outlineWidth}px solid #3d99ff;
                border-radius: 8px;
            `,
        });
        global.window_group.add_child(this._outline);

        // Originally, only `notify::focus-window` was used but that had issues
        // with popups on Wayland. `restacked` by itself seems to be kinda
        // spotty on Wayland for the first window that is opened on a workspace.
        global.display.connectObject(
            'restacked',
            () => this._updateOutline(),
            'notify::focus-window',
            () => this._updateOutline(),
            this
        );

        this._updateOutline();
    }

    destroy() {
        this._cancelGeometryUpdate();

        this._outline.destroy();
        this._outline = null;

        this._window?.disconnectObject(this);
        this._window = null;

        global.display.disconnectObject(this);

        clearTimeout(this._resetTimer);

        super.destroy();
    }

    /**
     *
     * @param {Window} window -
     * @param {number} workspaceSwitchAnimationDuration -
     */
    indicate(window, workspaceSwitchAnimationDuration = 250) {
        this.resetAnimation();

        if (!this.shouldIndicate(window)) {
            return;
        }

        const animatingWorkspaceSwitch =
            !!Main.wm._workspaceAnimation._switchData;

        // Only need to use an animation to indicate the focus when switching
        // workspaces. In the other cases, there is the static `this._outline`.
        if (!animatingWorkspaceSwitch) {
            return;
        }

        const windowActor = window.get_compositor_private();
        const workspaceAnimationWindowClone =
            this._getWindowCloneForWorkspaceAnimation(
                windowActor,
                animatingWorkspaceSwitch
            );
        const [monitorContainer, workspaceContainer] = this._createContainers(
            window,
            workspaceAnimationWindowClone,
            workspaceSwitchAnimationDuration
        );
        const customClone = this._createWindowClone(
            windowActor,
            monitorContainer
        );
        const outline = this._createOutline(window, monitorContainer);

        workspaceContainer.add_child(outline);
        workspaceContainer.add_child(customClone);

        workspaceAnimationWindowClone?.hide();

        this._resetTimer = setTimeout(
            () => this.resetAnimation(),
            workspaceSwitchAnimationDuration
        );
    }

    _cancelGeometryUpdate() {
        if (this._laterID) {
            global.compositor.get_laters().remove(this._laterID);
            this._laterID = 0;
        }
    }

    _createOutline(window, monitorContainer) {
        const {x, y, width, height} = window.get_frame_rect();
        const outline = new St.Widget({
            style: `
                background-color: #3d99ff;
                border-radius: 18px;
            `,
            x: x - monitorContainer.x - this._outlineWidth,
            y: y - monitorContainer.y - this._outlineWidth,
            width: width + 2 * this._outlineWidth,
            height: height + 2 * this._outlineWidth,
        });

        return outline;
    }

    _queueGeometryUpdate() {
        const windowActor = this._window.get_compositor_private();

        if (!windowActor) {
            return;
        }

        this._laterID = global.compositor
            .get_laters()
            .add(Meta.LaterType.BEFORE_REDRAW, () => {
                const {x, y, width, height} = this._window.get_frame_rect();

                this._outline.set({
                    x: x - this._outlineWidth,
                    y: y - this._outlineWidth,
                    width: width + this._outlineWidth * 2,
                    height: height + this._outlineWidth * 2,
                });
                this._outline.show();

                global.window_group.set_child_below_sibling(
                    this._outline,
                    windowActor
                );

                this._laterID = 0;
                return GLib.SOURCE_REMOVE;
            });
    }

    _updateOutline() {
        this._cancelGeometryUpdate();

        this._window?.disconnectObject(this);

        const window = global.display.focus_window;

        if (!window || !this._allowsWindowType(window.get_window_type())) {
            this._outline.hide();
            return;
        }

        this._window = window;
        this._window.connectObject(
            'position-changed',
            () => this._updateOutline(),
            'size-changed',
            () => this._updateOutline(),
            this
        );

        if (
            this._window.is_fullscreen() ||
            this._window.get_maximized() === Meta.MaximizeFlags.BOTH
        ) {
            this._outline.hide();
        } else {
            this._queueGeometryUpdate();
        }
    }
}
