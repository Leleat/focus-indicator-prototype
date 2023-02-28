'use strict';

const { Clutter, Gio, Graphene, Meta, Shell, St } = imports.gi;
const { main: Main, osdWindow: OsdWindow } = imports.ui;

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

var FocusIndicator = class FocusIndicator  {
    static getInstance() {
        if (!this._singleton)
            this._singleton = new FocusIndicator();

        return this._singleton;
    }

    constructor() {
        const ExtensionUtils = imports.misc.extensionUtils;
        const Me = ExtensionUtils.getCurrentExtension();
        this._settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
        this._actors = [];

        // dumb way to save the focused window for the switch-to-app shortcuts aka
        // super+nr and the app switcher (under certain multi monitor circumstances)
        // across a workspace switch...
        this.focus = null;
        this._unmanagedMap = new Map();

        global.get_window_actors().forEach(a => this._onWindowCreated(a.get_meta_window()));
        this._windowCreateId = global.display.connect('window-created',
            (_, window) => this._onWindowCreated(window));

        this._overviewId = Main.overview.connect('showing', () => this.reset());
    }

    destroy() {
        this.reset();

        global.display.disconnect(this._windowCreateId);
        this._windowCreateId = 0;

        Main.overview.disconnect(this._overviewId);
        this._overviewId = 0;

        this._unmanagedMap.forEach((id, window) => window.disconnect(id));
        this._unmanagedMap.clear();

        FocusIndicator._singleton = null;
    }

    reset() {
        global.get_window_actors().forEach(a => a.set_opacity(255));
        this._actors.forEach(a => a?.destroy());
        this._actors = [];
        this.focus = null;
    }

    indicate({
        focus,
        startingParams = null,
        animParams = null,
        secondaryAnim = null
    }) {
        this.reset();

        if (Main.overview.visible)
            return false;

        if (!focus)
            return false;

        if (focus.get_maximized() ===  Meta.MaximizeFlags.BOTH
            || focus.is_fullscreen() || focus.minimized)
            return false;

        const source = focus.get_compositor_private();
        if (!source)
            return false;

        const monitor = source.get_meta_window().get_monitor();
        const monitorRect = global.display.get_monitor_geometry(monitor);
        const upDelay = animParams?.upDelay ?? this._settings.get_int('anim-up-delay');
        const upDuration = animParams?.upDuration ?? this._settings.get_int('anim-up-duration');
        const upMode = animParams?.upMode ?? EasingMode[this._settings.get_int('anim-up-mode')];

        const border = this._createBorder(focus, monitorRect, startingParams ?? { x: focus.get_frame_rect().x, y: focus.get_frame_rect().y });

        const pos = secondaryAnim ? {} : {x: focus.get_frame_rect().x, y: focus.get_frame_rect().y,};

        border.ease({
            opacity: 255,
            duration: secondaryAnim ? this._settings.get_int('workspace-switch-delay') : upDelay,
            mode: Clutter.AnimationMode.EASE_IN
        });

        border.ease({
            ...pos,
            width: focus.get_frame_rect().width,
            height: focus.get_frame_rect().height,
            delay: upDelay,
            duration: upDuration,
            mode: upMode,
            onComplete: () => this.reset()
        });

        if (secondaryAnim) {
            // border is a child of an actor with monitor dimensions while param
            // is using absolute position coords
            secondaryAnim.x = secondaryAnim.x ? secondaryAnim.x - monitorRect.x : undefined;
            secondaryAnim.y = secondaryAnim.y ? secondaryAnim.y - monitorRect.y : undefined;

            border.ease({ ...secondaryAnim });
        }

        return true;
    }

    _createBorder(focus, monitorRect, startingParams) {
        const clipTo = new Clutter.Actor({
            clip_to_allocation: true,
            x: monitorRect.x,
            y: monitorRect.y,
            width: monitorRect.width,
            height: monitorRect.height,
        });
        const osd = Main.uiGroup.get_children().find(child =>
            child instanceof OsdWindow.OsdWindow);

        if (osd)
            Main.uiGroup.insert_child_below(clipTo, osd);
        else
            Main.uiGroup.add_child(clipTo);

        this._actors.push(clipTo);

        const border = new St.Widget({
            style: `border: 4px solid #3584e4;`,
            x: startingParams.x - clipTo.x - 100,
            y: startingParams.y - clipTo.y - 100,
            width: focus.get_frame_rect().width + 200,
            height: focus.get_frame_rect().height + 200,
            opacity: 0
        });
        clipTo.add_child(border);

        return border;
    }

    _onWindowCreated(window) {
        if (!window)
            return;

        if (window.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        const unmanagedId = window.connect('unmanaged', () => {
            window.disconnect(unmanagedId);
            this._unmanagedMap.delete(window);

            if (window.get_window_type() !== Meta.WindowType.NORMAL)
                return;

            const focus = global.display.focus_window;
            if (!focus || focus === window)
                return;

            this.indicate({ focus });
        });

        this._unmanagedMap.set(window, unmanagedId);
    }
}
