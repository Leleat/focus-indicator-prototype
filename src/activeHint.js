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
        });

        // Put a copy of the focused window above the other windows
        const focusedClone = this._createClone(focusedRecord, monitor, {
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            scale_x: startingScaleFocus,
            scale_y: startingScaleFocus
        });
        this._cloneMovementAnimation(focusedClone, focusedRecord.windowActor);

        // Add scale effect to focused window
        focusedClone.ease({
            scale_x: 1,
            scale_y: 1,
            delay: scaleDelayFocus,
            duration: scaleDurationFocus,
            mode: scaleModeFocus,
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
