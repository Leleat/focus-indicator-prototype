'use strict';

const { Clutter, Meta } = imports.gi;
const { altTab: AltTab, main: Main, workspaceAnimation: WorkspaceAnimation } = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { FocusIndicator } = Me.imports.src.focusIndicator;

var CustomWorkspaceAnimation = class CustomWorkspaceAnimation {
    constructor() {
        this._workspaceAnimationAnimateSwitch = Main.wm._workspaceAnimation.animateSwitch;
        this._override();
    }

    destroy() {
        Main.wm._workspaceAnimation.animateSwitch = this._workspaceAnimationAnimateSwitch;
        this._workspaceAnimationAnimateSwitch = null;
    }

    _override() {
        Main.wm._workspaceAnimation.animateSwitch = function(from, to, direction, onComplete) {
            this._swipeTracker.enabled = false;

            let workspaceIndices = [];

            switch (direction) {
            case Meta.MotionDirection.UP:
            case Meta.MotionDirection.LEFT:
            case Meta.MotionDirection.UP_LEFT:
            case Meta.MotionDirection.UP_RIGHT:
                workspaceIndices = [to, from];
                break;

            case Meta.MotionDirection.DOWN:
            case Meta.MotionDirection.RIGHT:
            case Meta.MotionDirection.DOWN_LEFT:
            case Meta.MotionDirection.DOWN_RIGHT:
                workspaceIndices = [from, to];
                break;
            }

            if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL &&
                direction !== Meta.MotionDirection.UP &&
                direction !== Meta.MotionDirection.DOWN)
                workspaceIndices.reverse();

            this._prepareWorkspaceSwitch(workspaceIndices);
            this._switchData.inProgress = true;

            const fromWs = global.workspace_manager.get_workspace_by_index(from);
            const toWs = global.workspace_manager.get_workspace_by_index(to);

            for (const monitorGroup of this._switchData.monitors) {
                monitorGroup.progress = monitorGroup.getWorkspaceProgress(fromWs);
                const progress = monitorGroup.getWorkspaceProgress(toWs);

                const params = {
                    duration: 250,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                };

                if (monitorGroup.index === Main.layoutManager.primaryIndex) {
                    params.onComplete = () => {
                        this._finishWorkspaceSwitch(this._switchData);
                        onComplete();
                        this._swipeTracker.enabled = true;
                    };
                }

                monitorGroup.ease_property('progress', progress, params);
            }

            ////////////////////
            // Indicate focus //
            ////////////////////

            // focus didn't change since a window was moved across ws
            if (this.movingWindow)
                return;

            const focusIndicator = FocusIndicator.getInstance();
            // ugly: focusIndicator.focus is set if there is a workspace switch
            // with super+nr or the app switcher since there doesn't seem to be a
            // way to get the newly focused window before/during the ws switch anim
            const focus = focusIndicator.focus ?? AltTab.getWindows(toWs)[0];
            focusIndicator.focus = null;

            if (!focus) {
                // Possible we were switching multiple ws
                focusIndicator.reset();
                return;
            }

            // switch ws with setting of 'WS on primary display only' and focus
            // is on secondary display, ie ws changed but focused window didn't
            const globalFocus = global.display.focus_window;
            if (globalFocus === focus)
                return;

            const focusActor = focus.get_compositor_private();
            let clone = null;

            this._switchData.monitors.find(monitorGroup => {
                return monitorGroup._workspaceGroups.find(workspaceGroup => {
                    return workspaceGroup._windowRecords.find(record => {
                        if (record.windowActor === focusActor)
                            clone = record.clone;

                        return record.windowActor === focusActor;
                    });
                });
            });

            // Focus switched to the secondary monitor with 'WS on primary display only'
            if (!clone) {
                focusIndicator.indicate({ focus });
            } else {
                const monitor = global.display.get_monitor_geometry(focus.get_monitor());
                const getAbsPos = actor => {
                    let pos = { x: actor.x, y: actor.y };
                    let parent = actor.get_parent();
                    while (parent) {
                        pos.x += parent.x;
                        pos.y += parent.y;
                        parent = parent.get_parent();
                    }
    
                    return pos;
                };
                const absPos = getAbsPos(clone);
                const ExtensionUtils = imports.misc.extensionUtils;
                const Me = ExtensionUtils.getCurrentExtension();
                const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
                focusIndicator.indicate({
                    focus,
                    startingParams: {
                        x: absPos.x + monitor.x,
                        y: absPos.y + monitor.y,
                    },
                    animParams: {
                        upDelay: settings.get_int('workspace-switch-delay')
                    },
                    secondaryAnim: {
                        x: focusActor.x,
                        y: focusActor.y,
                        duration: 250,
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    }
                });
            }

        }
    }
}
