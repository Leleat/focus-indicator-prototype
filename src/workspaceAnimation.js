'use strict';

const { Clutter, Meta } = imports.gi;
const { altTab: AltTab, main: Main, workspaceAnimation: WorkspaceAnimation } = imports.ui;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { FocusIndicator } = Me.imports.src.focusIndicator;

const EasingMode = [
    Clutter.AnimationMode.EASE_IN,
    Clutter.AnimationMode.EASE_IN_BACK,
    Clutter.AnimationMode.EASE_IN_BOUNCE,
    Clutter.AnimationMode.EASE_IN_CIRC,
    Clutter.AnimationMode.EASE_IN_CUBIC,
    Clutter.AnimationMode.EASE_IN_ELASTIC,
    Clutter.AnimationMode.EASE_IN_EXPO,
    Clutter.AnimationMode.EASE_IN_OUT,
    Clutter.AnimationMode.EASE_IN_OUT_BACK,
    Clutter.AnimationMode.EASE_IN_OUT_BOUNCE,
    Clutter.AnimationMode.EASE_IN_OUT_CIRC,
    Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
    Clutter.AnimationMode.EASE_IN_OUT_ELASTIC,
    Clutter.AnimationMode.EASE_IN_OUT_EXPO,
    Clutter.AnimationMode.EASE_IN_OUT_QUAD,
    Clutter.AnimationMode.EASE_IN_OUT_QUART,
    Clutter.AnimationMode.EASE_IN_OUT_QUINT,
    Clutter.AnimationMode.EASE_IN_OUT_SINE,
    Clutter.AnimationMode.EASE_IN_QUAD,
    Clutter.AnimationMode.EASE_IN_QUART,
    Clutter.AnimationMode.EASE_IN_QUINT,
    Clutter.AnimationMode.EASE_IN_SINE,
    Clutter.AnimationMode.EASE_OUT,
    Clutter.AnimationMode.EASE_OUT_BACK,
    Clutter.AnimationMode.EASE_OUT_BOUNCE,
    Clutter.AnimationMode.EASE_OUT_CIRC,
    Clutter.AnimationMode.EASE_OUT_CUBIC,
    Clutter.AnimationMode.EASE_OUT_ELASTIC,
    Clutter.AnimationMode.EASE_OUT_EXPO,
    Clutter.AnimationMode.EASE_OUT_QUAD,
    Clutter.AnimationMode.EASE_OUT_QUART,
    Clutter.AnimationMode.EASE_OUT_QUINT,
    Clutter.AnimationMode.EASE_OUT_SINE
];

var CustomWorkspaceAnimation = class CustomWorkspaceAnimation {
    constructor() {
        this._workspaceAnimationAnimateSwitch = Main.wm._workspaceAnimation.animateSwitch;
        this._swipeBeginId = 0;
        this._swipeEndId = 0;

        this._override();
    }

    destroy() {
        Main.wm._workspaceAnimation.animateSwitch = this._workspaceAnimationAnimateSwitch;
        this._workspaceAnimationAnimateSwitch = null;

        Main.wm._workspaceAnimation._swipeTracker.disconnect(this._swipeBeginId);
        this._swipeBeginId = 0;

        Main.wm._workspaceAnimation._swipeTracker.disconnect(this._swipeEndId);
        this._swipeEndId = 0;
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
                    // get_transformed_position seems to work during swipe
                    // gestures but not during switching with keyboard shortcuts
                    // havent looked into why that is...
                    const transformPos = actor.get_transformed_position();
                    if (transformPos[0] && transformPos[1])
                        return { x: transformPos[0], y: transformPos[1] };

                    let pos = { x: actor.x, y: actor.y };
                    let parent = actor.get_parent();
                    while (parent) {
                        pos.x += parent.x;
                        pos.y += parent.y;
                        parent = parent.get_parent();
                    }

                    pos.x += monitor.x;
                    pos.y += monitor.y;

                    return pos;
                };
                const absPos = getAbsPos(clone);
                const ExtensionUtils = imports.misc.extensionUtils;
                const Me = ExtensionUtils.getCurrentExtension();
                const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);

                if (focusIndicator.indicate({
                    focus,
                    startingParams: settings.get_boolean('use-border')
                        ? { x: focus.get_frame_rect().x, y: focus.get_frame_rect().y }
                        : absPos,
                    animParams: {
                        upDelay: settings.get_int('workspace-switch-delay')
                    },
                    secondaryAnim: settings.get_boolean('use-border')
                        ? {
                            x: focus.get_frame_rect().x,
                            y: focus.get_frame_rect().y,
                            delay: settings.get_int('workspace-switch-delay'),
                            duration: settings.get_int('border-duration'),
                            mode: EasingMode[settings.get_int('border-mode')]
                        } : {
                            x: focusActor.x,
                            y: focusActor.y,
                            duration: 250,
                            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                        }
                }) && settings.get_boolean('use-border') === false) {
                    clone.hide();
                }
            }
        }

        this._swipeBeginId = Main.wm._workspaceAnimation._swipeTracker.connect('begin', () => {
            FocusIndicator.getInstance().reset();
        });

        this._swipeEndId = Main.wm._workspaceAnimation._swipeTracker.connect('end', (tracker, duration, endProgress) => {
            const focusIndicator = FocusIndicator.getInstance();
            const switchData = Main.wm._workspaceAnimation._switchData;

            // No switchData if there is nothing to animate; for instance if the
            // swipe gesture was big enough to fully lead to the new ws
            if (!switchData) {
                const focus = global.display.focus_window;
                focusIndicator.indicate({ focus });
                return;
            }

            const monitorGroup = switchData.monitors[0];
            const transition = monitorGroup?.get_transition('progress');
            if (!transition)
                return;

            const newWs = switchData.baseMonitorGroup.findClosestWorkspace(endProgress);
            // The animation for the workspace switching is variable. From testing
            // it can range from 100 - 400 ms. When switching workspaces with
            // keyboard shortcuts, the focus indication starts at 200 ms of the
            // 250 ms animation. So try to make it feel similiar for swiping...
            const marker = 200 * transition.get_duration() / 250;

            transition.add_marker_at_time('start_focus_indication', marker);
            transition.connect('marker-reached', (transition, markerName, msecs) => {
                if (markerName !== 'start_focus_indication')
                    return;

                // ... everything below here is basically copy/pasted from above :x

                const focus = AltTab.getWindows(newWs)[0];
                if (!focus)
                    return;

                const focusActor = focus.get_compositor_private();
                let clone = null;

                switchData.monitors.find(monitorGroup => {
                    return monitorGroup._workspaceGroups.find(workspaceGroup => {
                        return workspaceGroup._windowRecords.find(record => {
                            if (record.windowActor === focusActor)
                                clone = record.clone;

                            return record.windowActor === focusActor;
                        });
                    });
                });

                if (!clone) {
                    focusIndicator.indicate({ focus });
                } else {
                    const monitor = global.display.get_monitor_geometry(focus.get_monitor());
                    const getAbsPos = actor => {
                        // get_transformed_position seems to work during swipe
                        // gestures but not during switching with keyboard shortcuts
                        // havent looked into why that is...
                        const transformPos = actor.get_transformed_position();
                        if (transformPos[0] && transformPos[1])
                            return { x: transformPos[0], y: transformPos[1] };

                        let pos = { x: actor.x, y: actor.y };
                        let parent = actor.get_parent();
                        while (parent) {
                            pos.x += parent.x;
                            pos.y += parent.y;
                            parent = parent.get_parent();
                        }

                        pos.x += monitor.x;
                        pos.y += monitor.y;

                        return pos;
                    };
                    const absPos = getAbsPos(clone);
                    const ExtensionUtils = imports.misc.extensionUtils;
                    const Me = ExtensionUtils.getCurrentExtension();
                    const settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);

                    if (focusIndicator.indicate({
                        focus,
                        startingParams: settings.get_boolean('use-border')
                            ? { x: focus.get_frame_rect().x, y: focus.get_frame_rect().y }
                            : absPos,
                        secondaryAnim: settings.get_boolean('use-border')
                            ? {
                                x: focus.get_frame_rect().x,
                                y: focus.get_frame_rect().y,
                                duration: transition.get_duration() - msecs,
                                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                            } : {
                                x: focusActor.x,
                                y: focusActor.y,
                                duration: transition.get_duration() - msecs,
                                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                            }
                    }) && settings.get_boolean('use-border') === false) {
                        clone.hide();
                    }
                }
            });
        });
    }
}
