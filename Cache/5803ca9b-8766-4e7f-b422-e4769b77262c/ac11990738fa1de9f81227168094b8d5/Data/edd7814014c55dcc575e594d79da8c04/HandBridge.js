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
            this.sendRateHz = this.sendRateHz;
            this.debugLog = this.debugLog;
            this.internetModule = require("LensStudio:InternetModule");
            this.socket = null;
            this.hand = null;
            this.connected = false;
            this.connecting = false;
            this.nextRetryAt = 0;
            this.retryDelay = 1.0;
            this.lastSendAt = 0;
            this.lastLogAt = 0;
        }
        __initialize() {
            super.__initialize();
            this.serverUrl = this.serverUrl;
            this.handToTrack = this.handToTrack;
            this.sendRateHz = this.sendRateHz;
            this.debugLog = this.debugLog;
            this.internetModule = require("LensStudio:InternetModule");
            this.socket = null;
            this.hand = null;
            this.connected = false;
            this.connecting = false;
            this.nextRetryAt = 0;
            this.retryDelay = 1.0;
            this.lastSendAt = 0;
            this.lastLogAt = 0;
        }
        onAwake() {
            this.createEvent("OnStartEvent").bind(() => this.onStart());
            this.createEvent("UpdateEvent").bind(() => this.onUpdate());
            this.createEvent("OnDestroyEvent").bind(() => this.closeSocket());
        }
        onStart() {
            this.hand = SIK_1.SIK.HandInputData.getHand(this.handToTrack);
            print(`[HandBridge] tracking ${this.handToTrack} hand -> ${this.serverUrl}`);
            this.connect();
        }
        // ---- networking ----------------------------------------------------
        connect() {
            if (this.connecting || this.connected) {
                return;
            }
            this.connecting = true;
            print(`[HandBridge] connecting to ${this.serverUrl} ...`);
            try {
                const sock = this.internetModule.createWebSocket(this.serverUrl);
                sock.binaryType = "blob";
                this.socket = sock;
                sock.onopen = () => {
                    this.connected = true;
                    this.connecting = false;
                    this.retryDelay = 1.0;
                    print("[HandBridge] connected");
                };
                sock.onclose = (event) => {
                    this.connected = false;
                    this.connecting = false;
                    this.scheduleRetry();
                    print(`[HandBridge] closed (code ${event.code})`);
                };
                sock.onerror = () => {
                    this.connected = false;
                    this.connecting = false;
                    this.scheduleRetry();
                    print("[HandBridge] socket error");
                };
            }
            catch (e) {
                this.connecting = false;
                this.scheduleRetry();
                print(`[HandBridge] createWebSocket threw: ${e}`);
            }
        }
        scheduleRetry() {
            this.socket = null;
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
        // ---- per-frame -----------------------------------------------------
        onUpdate() {
            const now = getTime();
            if (!this.connected) {
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
            const hand = this.hand;
            if (hand === null) {
                return;
            }
            const tracked = hand.isTracked();
            const fingers = tracked ? this.measure(hand) : [
                [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]
            ];
            const payload = {
                t: Math.round(now * 1000),
                tracked: tracked,
                hand: this.handToTrack,
                f: fingers
            };
            try {
                this.socket.send(JSON.stringify(payload));
            }
            catch (e) {
                this.connected = false;
                this.scheduleRetry();
            }
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
        measure(hand) {
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