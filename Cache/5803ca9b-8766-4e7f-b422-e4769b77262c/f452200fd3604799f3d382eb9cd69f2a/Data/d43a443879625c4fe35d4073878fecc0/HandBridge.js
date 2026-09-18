"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandBridge = void 0;
var __selfType = requireType("./HandBridge");
function component(target) {
    target.getTypeName = function () { return __selfType; };
    if (target.prototype.hasOwnProperty("getTypeName"))
        return;
    Object.defineProperty(target.prototype, "getTypeName", {
        value: function () { return __selfType; },
        configurable: true,
        writable: true
    });
}
const SIK_1 = require("SpectaclesInteractionKit.lspkg/SIK");
/**
 * Streams Spectacles hand tracking to the Delto DG-5F bridge over WebSocket.
 *
 * This script is deliberately "dumb": it measures the operator's hand in
 * degrees and sends those raw numbers. All scaling, joint limits, smoothing
 * and rate limiting live in bridge/config.json on the PC, so retuning the
 * robot is a file edit and a 2s restart instead of a Lens rebuild + push.
 *
 * Wire format (one JSON text frame per tick):
 *   {"t":<ms>,"tracked":<bool>,"hand":"right","f":[[4],[4],[4],[4],[4]]}
 * fingers are thumb, index, middle, ring, pinky. Within a finger:
 *   thumb  -> [abduction, opposition, mcp flexion, ip flexion]
 *   others -> [abduction, mcp flexion, pip flexion, dip flexion]
 *
 * Assign `statusText` to see connection state on-device. The Logger panel is
 * only available while tethered to Lens Studio, so without the HUD a failure
 * on the glasses is invisible.
 */
const RAD2DEG = 180.0 / Math.PI;
function angleBetween(a, b) {
    const la = a.length;
    const lb = b.length;
    if (la < 1e-5 || lb < 1e-5) {
        return 0;
    }
    let c = a.dot(b) / (la * lb);
    if (c > 1)
        c = 1;
    if (c < -1)
        c = -1;
    return Math.acos(c) * RAD2DEG;
}
/** Angle from `from` to `to` measured about `axis`, signed by the right-hand rule. */
function signedAngleAbout(from, to, axis) {
    const mag = angleBetween(from, to);
    return from.cross(to).dot(axis) < 0 ? -mag : mag;
}
/** Component of `v` lying in the plane whose normal is the unit vector `n`. */
function projectOntoPlane(v, n) {
    return v.sub(n.uniformScale(v.dot(n)));
}
const COLOR_OK = new vec4(0.2, 0.9, 0.4, 1.0);
const COLOR_WARN = new vec4(1.0, 0.75, 0.2, 1.0);
const COLOR_BAD = new vec4(1.0, 0.35, 0.35, 1.0);
let HandBridge = (() => {
    let _classDecorators = [component];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = BaseScriptComponent;
    var HandBridge = _classThis = class extends _classSuper {
        constructor() {
            super();
            this.serverUrl = this.serverUrl;
            this.handToTrack = this.handToTrack;
            this.autoSwitchHand = this.autoSwitchHand;
            this.sendRateHz = this.sendRateHz;
            this.statusText = this.statusText;
            this.debugLog = this.debugLog;
            this.internetModule = require("LensStudio:InternetModule");
            this.socket = null;
            this.rightHand = null;
            this.leftHand = null;
            this.activeHand = "right";
            this.urls = [];
            this.urlIndex = 0;
            this.connected = false;
            this.connecting = false;
            this.nextRetryAt = 0;
            this.retryDelay = 1.0;
            this.lastSendAt = 0;
            this.lastLogAt = 0;
            this.lastHudAt = 0;
            // --- diagnostics surfaced on the HUD ---
            this.state = "STARTING";
            this.attempts = 0;
            this.packetsSent = 0;
            this.lastError = "-";
            this.lastCloseCode = 0;
            this.connectedAt = 0;
            this.moduleOk = false;
        }
        __initialize() {
            super.__initialize();
            this.serverUrl = this.serverUrl;
            this.handToTrack = this.handToTrack;
            this.autoSwitchHand = this.autoSwitchHand;
            this.sendRateHz = this.sendRateHz;
            this.statusText = this.statusText;
            this.debugLog = this.debugLog;
            this.internetModule = require("LensStudio:InternetModule");
            this.socket = null;
            this.rightHand = null;
            this.leftHand = null;
            this.activeHand = "right";
            this.urls = [];
            this.urlIndex = 0;
            this.connected = false;
            this.connecting = false;
            this.nextRetryAt = 0;
            this.retryDelay = 1.0;
            this.lastSendAt = 0;
            this.lastLogAt = 0;
            this.lastHudAt = 0;
            // --- diagnostics surfaced on the HUD ---
            this.state = "STARTING";
            this.attempts = 0;
            this.packetsSent = 0;
            this.lastError = "-";
            this.lastCloseCode = 0;
            this.connectedAt = 0;
            this.moduleOk = false;
        }
        onAwake() {
            this.createEvent("OnStartEvent").bind(() => this.onStart());
            this.createEvent("UpdateEvent").bind(() => this.onUpdate());
            this.createEvent("OnDestroyEvent").bind(() => this.closeSocket());
        }
        onStart() {
            // Fail loudly and visibly rather than throwing into the void.
            if (this.internetModule === undefined || this.internetModule === null) {
                this.state = "NO INTERNET MODULE";
                this.lastError = "require('LensStudio:InternetModule') returned nothing";
                this.renderHud(true);
                return;
            }
            this.moduleOk = true;
            // A hotspot reassigns the PC's IP fairly often, and re-pushing a Lens just
            // to change one string is slow. Accept several and rotate on each retry.
            this.urls = this.serverUrl
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            if (this.urls.length === 0) {
                this.state = "NO URL SET";
                this.lastError = "Server Url is empty";
                this.renderHud(true);
                return;
            }
            // Resolve both hands up front so switching is instant and cannot fail
            // mid-session.
            try {
                this.rightHand = SIK_1.SIK.HandInputData.getHand("right");
                this.leftHand = SIK_1.SIK.HandInputData.getHand("left");
                this.activeHand = this.handToTrack === "left" ? "left" : "right";
            }
            catch (e) {
                this.state = "HAND INIT FAILED";
                this.lastError = `${e}`;
                this.renderHud(true);
                return;
            }
            print(`[HandBridge] tracking ${this.handToTrack} hand -> ${this.urls.join(" | ")}`);
            this.renderHud(true);
            this.connect();
        }
        currentUrl() {
            return this.urls[this.urlIndex % this.urls.length];
        }
        handObject(which) {
            return which === "left" ? this.leftHand : this.rightHand;
        }
        /**
         * Decides which hand is driving this frame.
         *
         * With autoSwitchHand off this is just the Inspector choice. With it on we
         * keep the current hand while it stays visible -- switching on every frame
         * a hand flickers out would make the robot jitter between two poses -- and
         * only hand over when the current one is gone and the other is present.
         */
        pickHand() {
            const current = this.handObject(this.activeHand);
            if (!this.autoSwitchHand) {
                this.activeHand = this.handToTrack === "left" ? "left" : "right";
                return this.handObject(this.activeHand);
            }
            if (current !== null && current.isTracked()) {
                return current;
            }
            const other = this.activeHand === "left" ? "right" : "left";
            const otherObj = this.handObject(other);
            if (otherObj !== null && otherObj.isTracked()) {
                this.activeHand = other;
                return otherObj;
            }
            return current;
        }
        // ---- networking ----------------------------------------------------
        connect() {
            if (this.connecting || this.connected || !this.moduleOk) {
                return;
            }
            this.connecting = true;
            this.attempts += 1;
            this.state = "CONNECTING";
            const url = this.currentUrl();
            this.renderHud(true);
            print(`[HandBridge] connect attempt ${this.attempts} -> ${url}`);
            try {
                const sock = this.internetModule.createWebSocket(url);
                sock.binaryType = "blob";
                this.socket = sock;
                sock.onopen = () => {
                    this.connected = true;
                    this.connecting = false;
                    this.retryDelay = 1.0;
                    this.connectedAt = getTime();
                    this.state = "CONNECTED";
                    this.lastError = "-";
                    this.renderHud(true);
                    print("[HandBridge] connected");
                };
                sock.onclose = (event) => {
                    this.connected = false;
                    this.connecting = false;
                    this.lastCloseCode = event.code;
                    // 1006 = abnormal close: no close frame. Almost always "never actually
                    // reached the server" -- wrong IP, firewall, or client isolation.
                    this.lastError = event.code === 1006
                        ? "1006 abnormal: never reached the PC (IP? firewall? hotspot isolation?)"
                        : `closed, code ${event.code}`;
                    this.state = "CLOSED";
                    this.scheduleRetry();
                    this.renderHud(true);
                    print(`[HandBridge] closed, code ${event.code}`);
                };
                sock.onerror = () => {
                    this.connected = false;
                    this.connecting = false;
                    this.state = "SOCKET ERROR";
                    this.lastError = "onerror -- no route to the PC, or ws:// refused";
                    this.scheduleRetry();
                    this.renderHud(true);
                    print("[HandBridge] socket error");
                };
            }
            catch (e) {
                this.connecting = false;
                this.state = "CREATE FAILED";
                // A synchronous throw usually means the URL scheme was rejected outright.
                this.lastError = `createWebSocket threw: ${e}`;
                this.scheduleRetry();
                this.renderHud(true);
                print(`[HandBridge] createWebSocket threw: ${e}`);
            }
        }
        scheduleRetry() {
            this.socket = null;
            // Move to the next candidate URL so a stale IP cannot wedge us forever.
            if (this.urls.length > 1) {
                this.urlIndex = (this.urlIndex + 1) % this.urls.length;
            }
            this.nextRetryAt = getTime() + this.retryDelay;
            // back off to at most 5s so a sleeping PC does not spam the log
            this.retryDelay = Math.min(this.retryDelay * 1.6, 5.0);
        }
        closeSocket() {
            if (this.socket !== null) {
                try {
                    this.socket.close();
                }
                catch (e) {
                    // already gone
                }
                this.socket = null;
            }
            this.connected = false;
        }
        // ---- HUD -----------------------------------------------------------
        renderHud(force) {
            if (this.statusText === undefined || this.statusText === null) {
                return;
            }
            const now = getTime();
            if (!force && now - this.lastHudAt < 0.25) {
                return;
            }
            this.lastHudAt = now;
            const activeObj = this.handObject(this.activeHand);
            const tracked = activeObj !== null && activeObj.isTracked();
            let hint = "";
            if (this.state === "CONNECTED") {
                hint = tracked ? "streaming" : "connected, but hand not visible";
            }
            else if (this.state === "CONNECTING") {
                hint = "waiting for the PC to answer...";
            }
            else {
                hint = `retry in ${Math.max(0, this.nextRetryAt - now).toFixed(1)}s`;
            }
            const uptime = this.connected ? `${(now - this.connectedAt).toFixed(0)}s` : "-";
            const urlLabel = this.urls.length > 1
                ? `${this.currentUrl()}  [${(this.urlIndex % this.urls.length) + 1}/${this.urls.length}]`
                : (this.urls.length === 1 ? this.currentUrl() : this.serverUrl);
            this.statusText.text =
                `DG-5F BRIDGE\n` +
                    `state : ${this.state}\n` +
                    `url   : ${urlLabel}\n` +
                    `try   : ${this.attempts}   up: ${uptime}\n` +
                    `sent  : ${this.packetsSent}\n` +
                    `hand  : ${this.activeHand}${this.autoSwitchHand ? " (auto)" : ""}` +
                    `${this.activeHand === "left" ? " mirrored" : ""} ` +
                    `${tracked ? "TRACKED" : "not visible"}\n` +
                    `note  : ${hint}\n` +
                    `err   : ${this.lastError}`;
            try {
                const c = this.state === "CONNECTED"
                    ? (tracked ? COLOR_OK : COLOR_WARN)
                    : (this.state === "CONNECTING" ? COLOR_WARN : COLOR_BAD);
                this.statusText.textFill.color = c;
            }
            catch (e) {
                // some Text configurations do not expose textFill; the text still updates
            }
        }
        // ---- per-frame -----------------------------------------------------
        onUpdate() {
            if (!this.moduleOk) {
                return;
            }
            const now = getTime();
            if (!this.connected) {
                this.renderHud(false);
                if (!this.connecting && now >= this.nextRetryAt) {
                    this.connect();
                }
                return;
            }
            const minInterval = 1.0 / Math.max(1, this.sendRateHz);
            if (now - this.lastSendAt < minInterval) {
                return;
            }
            this.lastSendAt = now;
            const hand = this.pickHand();
            if (hand === null) {
                return;
            }
            const tracked = hand.isTracked();
            const fingers = tracked ? this.measure(hand, this.activeHand === "left") : [
                [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]
            ];
            const payload = {
                t: Math.round(now * 1000),
                tracked: tracked,
                hand: this.activeHand,
                f: fingers
            };
            try {
                this.socket.send(JSON.stringify(payload));
                this.packetsSent += 1;
            }
            catch (e) {
                this.connected = false;
                this.state = "SEND FAILED";
                this.lastError = `${e}`;
                this.scheduleRetry();
            }
            this.renderHud(false);
            if (this.debugLog && now - this.lastLogAt > 1.0) {
                this.lastLogAt = now;
                if (tracked) {
                    const fmt = (a) => a.map((v) => v.toFixed(0)).join(",");
                    print(`[HandBridge] T[${fmt(fingers[0])}] I[${fmt(fingers[1])}] ` +
                        `M[${fmt(fingers[2])}] R[${fmt(fingers[3])}] P[${fmt(fingers[4])}]`);
                }
                else {
                    print("[HandBridge] hand not tracked");
                }
            }
        }
        // ---- measurement ---------------------------------------------------
        /**
         * Builds a palm-local frame, then reads each finger against it.
         *
         * forward : wrist -> middle knuckle (down the palm)
         * side    : pinky knuckle -> index knuckle, orthogonalised
         * normal  : palm normal, forward x side
         *
         * Flexion angles are unsigned angles between consecutive bone vectors,
         * which is robust because fingers only bend one way. Abduction and thumb
         * opposition are signed about the palm frame, so their sign depends on
         * handedness -- if a joint drives the wrong way on the robot, swap that
         * joint's two "out" values in bridge/config.json rather than editing this.
         */
        measure(hand, isLeft) {
            const wrist = hand.wrist.position;
            const idxK = hand.indexKnuckle.position;
            const midK = hand.middleKnuckle.position;
            const pkyK = hand.pinkyKnuckle.position;
            const forward = midK.sub(wrist).normalize();
            const sideRaw = idxK.sub(pkyK).normalize();
            let normal = forward.cross(sideRaw);
            if (normal.length < 1e-5) {
                return [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
            }
            normal = normal.normalize();
            // A left hand is the mirror image of a right one, so forward x side points
            // out of the opposite face of the palm. Left as-is, every signed quantity
            // (abduction, thumb opposition) would come out negated and those five
            // joints would drive backwards. Flipping the normal restores a consistent
            // chirality, so either hand produces the same motion on the right-handed
            // robot and config.json needs no per-hand tuning.
            if (isLeft) {
                normal = normal.uniformScale(-1);
            }
            const side = normal.cross(forward).normalize();
            // --- thumb ---
            const tCmc = hand.thumbBaseJoint.position;
            const tMcp = hand.thumbKnuckle.position;
            const tIp = hand.thumbMidJoint.position;
            const tTip = hand.thumbTip.position;
            const tMeta = tMcp.sub(tCmc);
            const tProx = tIp.sub(tMcp);
            const tDist = tTip.sub(tIp);
            // Opposition: rotate the thumb metacarpal about the palm's forward axis.
            // ~0 when the thumb lies out to the side, ~90 when swung across the palm.
            const tMetaInPlane = projectOntoPlane(tMeta, forward);
            const opposition = Math.abs(signedAngleAbout(side, tMetaInPlane, forward));
            // Abduction: how far the thumb opens within the palm plane.
            const tMetaOnPalm = projectOntoPlane(tMeta, normal);
            const thumbAbd = signedAngleAbout(forward, tMetaOnPalm, normal);
            const thumb = [
                thumbAbd,
                opposition,
                angleBetween(tMeta, tProx),
                angleBetween(tProx, tDist)
            ];
            return [
                thumb,
                this.measureFinger(hand.indexKnuckle.position, hand.indexMidJoint.position, hand.indexUpperJoint.position, hand.indexTip.position, wrist, forward, normal),
                this.measureFinger(hand.middleKnuckle.position, hand.middleMidJoint.position, hand.middleUpperJoint.position, hand.middleTip.position, wrist, forward, normal),
                this.measureFinger(hand.ringKnuckle.position, hand.ringMidJoint.position, hand.ringUpperJoint.position, hand.ringTip.position, wrist, forward, normal),
                this.measureFinger(hand.pinkyKnuckle.position, hand.pinkyMidJoint.position, hand.pinkyUpperJoint.position, hand.pinkyTip.position, wrist, forward, normal)
            ];
        }
        measureFinger(mcp, pip, dip, tip, wrist, forward, normal) {
            const meta = mcp.sub(wrist);
            const prox = pip.sub(mcp);
            const mid = dip.sub(pip);
            const dist = tip.sub(dip);
            const proxOnPalm = projectOntoPlane(prox, normal);
            const abduction = signedAngleAbout(forward, proxOnPalm, normal);
            return [
                abduction,
                angleBetween(meta, prox),
                angleBetween(prox, mid),
                angleBetween(mid, dist)
            ];
        }
    };
    __setFunctionName(_classThis, "HandBridge");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HandBridge = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HandBridge = _classThis;
})();
exports.HandBridge = HandBridge;
//# sourceMappingURL=HandBridge.js.map