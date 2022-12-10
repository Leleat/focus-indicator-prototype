'use strict';

const { Clutter, GObject, Graphene, Meta, St } = imports.gi;
const { background: Background, main: Main } = imports.ui;

var ActiveHint = GObject.registerClass(
class ActiveHint extends St.Widget {
    _init() {
        super._init()

        const ExtensionUtils = imports.misc.extensionUtils;
        const Me = ExtensionUtils.getCurrentExtension();

        this._settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
        this._actors = [];

        global.workspace_manager.connectObject('workspace-switched',
            () => this._onWsSwitched(), this);
        Main.overview.connectObject('showing', () => this._reset(), this);

        global.window_group.add_child(this);
    }

    destroy() {
        this._reset();

        this._settings.run_dispose();
        this._settings = null;

        super.destroy();
    }

    _reset() {
        this._actors.forEach(a => a.destroy());
        this._actors = [];
    }

    _onWsSwitched() {
        // In case of a switch of a workspace during an ongoing switch animation
        this._reset();

        if (Main.overview.visible)
            return;

        const focus = global.display.focus_window;
        if (!focus)
            return;

        if (focus.is_fullscreen() || focus.get_maximized() === Meta.MaximizeFlags.BOTH)
            return;

        this._giveHint(focus);
    }

    _giveHint(focus) {
        const actor = focus.get_compositor_private();
        if (!actor)
            return;

        // Grab data from the workspaceAnimation to copy their animation
        const switchData = Main.wm._workspaceAnimation._switchData;
        const monitorGroup = switchData?.monitors[focus.get_monitor()];

        // 'ws on primary display only' depending on which monitor the focus is
        if (!monitorGroup)
            return;

        const monitor = monitorGroup._monitor;
        const workspacegGroup = monitorGroup._workspaceGroups.find(group => {
            const records = group._windowRecords;
            return records.find(r => r.windowActor === actor);
        });

        // 'ws on primary display only' depending on which monitor the focus is
        if (!workspacegGroup)
            return;

        const windowRecords = workspacegGroup._windowRecords;

        // AFAICS, at this point we shouldn't hit this path but just in case
        // return early. Otherwise we create a background but don't destroy it
        if (!windowRecords.length)
            return;

        // Get prefs
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

        const scale = this._settings.get_boolean('scale');
        const startingScale = this._settings.get_int('starting-scale') / 100;
        const scaleDelay = this._settings.get_int('scale-delay');
        const scaleDuration = this._settings.get_int('scale-duration');
        const scaleMode = EasingMode[this._settings.get_int('scale-mode')];

        const darken = this._settings.get_boolean('darken');
        const darkenColor = this._settings.get_string('darken-color');
        const darkenDelay = this._settings.get_int('darken-delay');
        const darkenDuration = this._settings.get_int('darken-duration');
        const darkenMode = EasingMode[this._settings.get_int('darken-mode')];

        const border = this._settings.get_boolean('border');
        const borderSize = this._settings.get_int('border-size');
        const borderColor = this._settings.get_string('border-color');
        const borderDelay = this._settings.get_int('border-delay');
        const borderDuration = this._settings.get_int('border-duration');
        const borderMode = EasingMode[this._settings.get_int('border-mode')];

        const scaleFocus = this._settings.get_boolean('scale-focus');
        const startingScaleFocus = this._settings.get_int('starting-scale-focus') / 100;
        const scaleDelayFocus = this._settings.get_int('scale-delay-focus');
        const scaleDurationFocus = this._settings.get_int('scale-duration-focus');
        const scaleModeFocus = EasingMode[this._settings.get_int('scale-mode-focus')];

        // Add background to cover the 'normal' workspace animation since the
        // focus animation may take longer
        const backgroundGroup = new Meta.BackgroundGroup();
        this.add_child(backgroundGroup);

        const backgroundManager = new Background.BackgroundManager({
            container: backgroundGroup,
            monitorIndex: focus.get_monitor()
        });
        this._actors.push(backgroundManager);
        this._actors.push(backgroundGroup);

        const focusedRecord = windowRecords.find(r => r.windowActor === actor);
        const otherRecords = windowRecords.filter(r => r.windowActor !== actor);

        // Animate non-focused windows
        otherRecords.forEach(record => {
            const otherClone = this._createClone(record, monitor);
            this._cloneMovementAnimation(otherClone, record.windowActor);

            if (scale) {
                otherClone.set_pivot_point(.5, .5);
                otherClone.set_scale(startingScale, startingScale);
                otherClone.ease({
                    scale_x: 1,
                    scale_y: 1,
                    delay:scaleDelay,
                    duration:scaleDuration,
                    mode: scaleMode
                });
            }

            if (darken) {
                const windowFrame = record.windowActor.get_meta_window().get_frame_rect();
                const shade = this._createWidget({
                    style: `background-color: ${darkenColor};`,
                    x: windowFrame.x - (record.windowActor.x - otherClone.x),
                    y: windowFrame.y - (record.windowActor.y - otherClone.y),
                    width: windowFrame.width,
                    height: windowFrame.height
                });
                this._cloneMovementAnimation(shade, windowFrame);

                shade.ease({
                    opacity: 0,
                    delay: darkenDelay,
                    duration: darkenDuration,
                    mode: darkenMode
                });

                if (scale) {
                    shade.set_pivot_point(0.5, 0.5);
                    shade.set_scale(startingScale, startingScale);
                    shade.ease({
                        scale_x: 1,
                        scale_y: 1,
                        delay: scaleDelay,
                        duration: scaleDuration,
                        mode: scaleMode
                    });
                }
            };
        });

        // Add border effect
        if (border) {
            const focusFrame = focusedRecord.windowActor.get_meta_window().get_frame_rect();
            const startingPos = this._getAbsPos(focusedRecord.clone);
            const border = this._createWidget({
                style: `background-color: ${borderColor};`,
                x: focusFrame.x - (focusedRecord.windowActor.x - startingPos.x) - borderSize / 2 + monitor.x,
                y: focusFrame.y - (focusedRecord.windowActor.y - startingPos.y) - borderSize / 2 + monitor.y,
                width: focusFrame.width + borderSize,
                height: focusFrame.height + borderSize
            });
            this._cloneMovementAnimation(border, {
                x: focusFrame.x - borderSize / 2,
                y: focusFrame.y - borderSize / 2
            });

            border.ease({
                opacity: 0,
                delay: borderDelay,
                duration: borderDuration,
                mode: borderMode
            });

            if (scaleFocus) {
                border.set_pivot_point(0.5, 0.5);
                border.set_scale(startingScaleFocus, startingScaleFocus);
                border.ease({
                    scale_x: 1,
                    scale_y: 1,
                    delay: scaleDelayFocus,
                    duration: scaleDurationFocus,
                    mode: scaleModeFocus
                });
            }
        }

        // Put a copy of the focused window above the other windows
        const focusedClone = this._createClone(focusedRecord, monitor);
        this._cloneMovementAnimation(focusedClone, focusedRecord.windowActor);

        // Add scale effect to focused window
        if (scaleFocus) {
            focusedClone.set_pivot_point(0.5, 0.5);
            focusedClone.set_scale(startingScaleFocus, startingScaleFocus);
            focusedClone.ease({
                scale_x: 1,
                scale_y: 1,
                delay: scaleDelayFocus,
                duration: scaleDurationFocus,
                mode: scaleModeFocus
            });
        }

        // TODO better way to check when last animation finished for the reset
        focusedClone.ease({
            opacity: 255,
            duration: Math.max(
                scale ? scaleDuration : 0,
                darken ? darkenDuration : 0,
                border ? borderDuration : 0,
                scaleFocus ? scaleDurationFocus : 0,
                250) + Math.max(
                    scale ? scaleDelay : 0,
                    darken ? darkenDelay : 0,
                    border ? borderDelay : 0,
                    scaleFocus ? scaleDelayFocus : 0
                ),
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => this._reset()
        });
    }

    // Create a clone of the workspaceAnimation clones
    _createClone(record, monitor, params = {}) {
        const { clone, windowActor } = record
        const startingPos = this._getAbsPos(clone);
        const { width, height} = windowActor;

        clone.hide();
        windowActor.hide();

        const clutterClone = new Clutter.Clone({
            source: windowActor,
            x: startingPos.x + monitor.x,
            y: startingPos.y + monitor.y,
            width,
            height,
            opacity: 255,
            ...params
        });

        Main.uiGroup.add_child(clutterClone);
        this._actors.push(clutterClone);

        return clutterClone;
    }

    _createWidget(params) {
        const widget = new St.Widget({ ...params });
        Main.uiGroup.add_child(widget);
        this._actors.push(widget);

        return widget;
    }

    // Copy movement of workspaceAnimation
    _cloneMovementAnimation(actor, target) {
        actor.ease({
            x: target.x,
            y: target.y,
            duration: 250,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _getAbsPos(actor) {
        let pos = { x: actor.x, y: actor.y };
        let parent = actor.get_parent();
        while (parent) {
            pos.x += parent.x;
            pos.y += parent.y;
            parent = parent.get_parent();
        }

        return pos;
    };
});
