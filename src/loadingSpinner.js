'use strict';

const { Clutter, GObject, Graphene, Shell, St } = imports.gi;
const { main: Main } = imports.ui;

var LoadingSpinner = GObject.registerClass(
class LoadingSpinner extends Clutter.Actor {
    _init() {
        super._init();

        this._startingApps = [];
        this._targetApp = null;

        this._activityButton = Main.panel.statusArea['activities'];
        this._activityLabel = this._activityButton.get_children()[0];

        this._spinner = new Spinner({ opacity: 0 });

        this._container = new St.Widget({ y_align: Clutter.ActorAlign.CENTER });
        this._activityButton.remove_child(this._activityLabel);
        this._activityButton.add_child(this._container);
        this._container.add_child(this._activityLabel);
        this._container.add_child(this._spinner);

        this._stateChangeId = Shell.AppSystem.get_default()
            .connect('app-state-changed', (_, app) => this._onAppStateChanged(app));

        global.stage.add_child(this);
    }

    destroy() {
        Shell.AppSystem.get_default().disconnect(this._stateChangeId);
        this._stateChangeId = 0;

        this._spinner.destroy();
        this._spinner = null;

        this._activityButton.remove_child(this._container);
        this._container.remove_child(this._activityLabel);
        this._activityButton.add_child(this._activityLabel);
        this._activityLabel = null;
        this._activityButton = null;
        this._container.destroy();
        this._container = null;

        this._targetApp = null;
        this._startingApps = [];

        super.destroy();
    }

    _startAnimation() {
        if (this._isLoadingSpinner)
            return;

        this._isLoadingSpinner = true;

        this._activityLabel.remove_all_transitions();
        this._spinner.remove_all_transitions();
        this._spinner.stop();

        this._activityLabel.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._activityLabel.hide();

                this._spinner.show();
                this._spinner.play();
                this._spinner.ease({
                    opacity: 255,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        });
    }

    _stopAnimation() {
        if (!this._isLoadingSpinner)
            return;

        this._isLoadingSpinner = false;

        this._activityLabel.remove_all_transitions();
        this._spinner.remove_all_transitions();

        this._spinner.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._spinner.stop();
                this._spinner.hide();

                this._activityLabel.show();
                this._activityLabel.ease({
                    opacity: 255,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD
                });
            }
        });
    }

    /**
     * Following code is mostly copy/pasted from panel.AppMenuButton with some
     * modifications to adapt it to the spinner...
     */

    _onAppStateChanged(app) {
        const state = app.state;
        if (state !== Shell.AppState.STARTING)
            this._startingApps = this._startingApps.filter(a => a !== app);
        else if (state === Shell.AppState.STARTING)
            this._startingApps.push(app);

        this._sync();
    }

    _findTargetApp() {
        const workspaceManager = global.workspace_manager;
        const workspace = workspaceManager.get_active_workspace();
        const tracker = Shell.WindowTracker.get_default();
        const focusedApp = tracker.focus_app;
        if (focusedApp && focusedApp.is_on_workspace(workspace))
            return focusedApp;

        for (let i = 0; i < this._startingApps.length; i++) {
            if (this._startingApps[i].is_on_workspace(workspace))
                return this._startingApps[i];
        }

        return null;
    }

    _sync() {
        const targetApp = this._findTargetApp();

        if (this._targetApp !== targetApp) {
            this._targetApp = targetApp;
            this._targetApp?.disconnectObject(this);
            this._targetApp?.connectObject('notify::busy',
                this._sync.bind(this), this);
        }

        const animate = this._targetApp !== null &&
            (this._targetApp.get_state() === Shell.AppState.STARTING ||
            this._targetApp.get_busy());

        if (animate)
            this._startAnimation();
        else
            this._stopAnimation();
    }
});

const Spinner = GObject.registerClass(
class Spinner extends St.BoxLayout {
    _init(params = {}) {
        super._init({ ...params });

        this._d1 = new St.Widget({
            style: '\
                background-color: #e6e6e6;\
                border-radius: 99px;\
                margin-right: 10px;',
            width: 6,
            height: 6,
            opacity: 255,
        });
        this.add_child(this._d1);

        this._d2 = new St.Widget({
            style: '\
                background-color: #e6e6e6;\
                border-radius: 99px;\
                margin-right: 10px;',
            width: 6,
            height: 6,
            opacity: 0,
        });
        this.add_child(this._d2);

        this._d3 = new St.Widget({
            style: '\
                background-color: #e6e6e6;\
                border-radius: 99px;',
            width: 6,
            height: 6,
            opacity: 0,
        });
        this.add_child(this._d3);
    }

    play() {
        this._reset();

        this._d1.ease({
            opacity: 0,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._d1.ease({
                opacity: 255,
                duration: 300,
                delay: 600,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this.play()
            })
        });
        this._d2.ease({
            opacity: 255,
            duration: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            repeatCount: 3,
            autoReverse: true
        });
        this._d3.ease({
            opacity: 255,
            duration: 300,
            delay: 300,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            repeatCount: 1,
            autoReverse: true,
        });
    }

    _reset() {
        this._d1.set_opacity(255);
        this._d2.set_opacity(0);
        this._d3.set_opacity(0);
    }

    stop() {
        this._d1.remove_all_transitions();
        this._d2.remove_all_transitions();
        this._d3.remove_all_transitions();
    }
});
