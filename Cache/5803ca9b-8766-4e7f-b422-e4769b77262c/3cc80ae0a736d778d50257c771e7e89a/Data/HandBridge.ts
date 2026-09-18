import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {BaseHand} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand"
import {HandType} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandType"

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

const RAD2DEG = 180.0 / Math.PI

function angleBetween(a: vec3, b: vec3): number {
  const la = a.length
  const lb = b.length
  if (la < 1e-5 || lb < 1e-5) {
    return 0
  }
  let c = a.dot(b) / (la * lb)
  if (c > 1) c = 1
  if (c < -1) c = -1
  return Math.acos(c) * RAD2DEG
}

/** Angle from `from` to `to` measured about `axis`, signed by the right-hand rule. */
function signedAngleAbout(from: vec3, to: vec3, axis: vec3): number {
  const mag = angleBetween(from, to)
  return from.cross(to).dot(axis) < 0 ? -mag : mag
}

/** Component of `v` lying in the plane whose normal is the unit vector `n`. */
function projectOntoPlane(v: vec3, n: vec3): vec3 {
  return v.sub(n.uniformScale(v.dot(n)))
}

@component
export class HandBridge extends BaseScriptComponent {
  @input
  @hint("Bridge address. Use the PC's Wi-Fi IP -- not 127.0.0.1 -- and make sure the Spectacles are on the same network.")
  serverUrl: string = "ws://192.168.124.7:8765"

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("right"), new ComboBoxItem("left")]))
  @hint("Which of YOUR hands drives the robot. The robot itself is a DG-5F-R (right hand).")
  handToTrack: string = "right"

  @input
  @hint("Send rate in Hz. 60 matches the bridge's default control loop.")
  sendRateHz: number = 60

  @input
  @hint("Print measured angles to the Logger panel once a second.")
  debugLog: boolean = false

  private internetModule: InternetModule = require("LensStudio:InternetModule")
  private socket: WebSocket | null = null
  private hand: BaseHand | null = null

  private connected: boolean = false
  private connecting: boolean = false
  private nextRetryAt: number = 0
  private retryDelay: number = 1.0
  private lastSendAt: number = 0
  private lastLogAt: number = 0

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    this.createEvent("OnDestroyEvent").bind(() => this.closeSocket())
  }

  private onStart() {
    this.hand = SIK.HandInputData.getHand(this.handToTrack as HandType)
    print(`[HandBridge] tracking ${this.handToTrack} hand -> ${this.serverUrl}`)
    this.connect()
  }

  // ---- networking ----------------------------------------------------
  private connect() {
    if (this.connecting || this.connected) {
      return
    }
    this.connecting = true
    print(`[HandBridge] connecting to ${this.serverUrl} ...`)

    try {
      const sock = this.internetModule.createWebSocket(this.serverUrl)
      sock.binaryType = "blob"
      this.socket = sock

      sock.onopen = () => {
        this.connected = true
        this.connecting = false
        this.retryDelay = 1.0
        print("[HandBridge] connected")
      }
      sock.onclose = (event: WebSocketCloseEvent) => {
        this.connected = false
        this.connecting = false
        this.scheduleRetry()
        print(`[HandBridge] closed (code ${event.code})`)
      }
      sock.onerror = () => {
        this.connected = false
        this.connecting = false
        this.scheduleRetry()
        print("[HandBridge] socket error")
      }
    } catch (e) {
      this.connecting = false
      this.scheduleRetry()
      print(`[HandBridge] createWebSocket threw: ${e}`)
    }
  }

  private scheduleRetry() {
    this.socket = null
    this.nextRetryAt = getTime() + this.retryDelay
    // back off to at most 5s so a sleeping PC does not spam the log
    this.retryDelay = Math.min(this.retryDelay * 1.6, 5.0)
  }

  private closeSocket() {
    if (this.socket !== null) {
      try {
        this.socket.close()
      } catch (e) {
        // already gone
      }
      this.socket = null
    }
    this.connected = false
  }

  // ---- per-frame -----------------------------------------------------
  private onUpdate() {
    const now = getTime()

    if (!this.connected) {
      if (!this.connecting && now >= this.nextRetryAt) {
        this.connect()
      }
      return
    }

    const minInterval = 1.0 / Math.max(1, this.sendRateHz)
    if (now - this.lastSendAt < minInterval) {
      return
    }
    this.lastSendAt = now

    const hand = this.hand
    if (hand === null) {
      return
    }

    const tracked = hand.isTracked()
    const fingers = tracked ? this.measure(hand) : [
      [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]
    ]

    const payload = {
      t: Math.round(now * 1000),
      tracked: tracked,
      hand: this.handToTrack,
      f: fingers
    }

    try {
      this.socket.send(JSON.stringify(payload))
    } catch (e) {
      this.connected = false
      this.scheduleRetry()
    }

    if (this.debugLog && now - this.lastLogAt > 1.0) {
      this.lastLogAt = now
      if (tracked) {
        const fmt = (a: number[]) => a.map((v) => v.toFixed(0)).join(",")
        print(`[HandBridge] T[${fmt(fingers[0])}] I[${fmt(fingers[1])}] ` +
              `M[${fmt(fingers[2])}] R[${fmt(fingers[3])}] P[${fmt(fingers[4])}]`)
      } else {
        print("[HandBridge] hand not tracked")
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
  private measure(hand: BaseHand): number[][] {
    const wrist = hand.wrist.position
    const idxK = hand.indexKnuckle.position
    const midK = hand.middleKnuckle.position
    const pkyK = hand.pinkyKnuckle.position

    const forward = midK.sub(wrist).normalize()
    const sideRaw = idxK.sub(pkyK).normalize()
    let normal = forward.cross(sideRaw)
    if (normal.length < 1e-5) {
      return [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
    }
    normal = normal.normalize()
    const side = normal.cross(forward).normalize()

    // --- thumb ---
    const tCmc = hand.thumbBaseJoint.position
    const tMcp = hand.thumbKnuckle.position
    const tIp = hand.thumbMidJoint.position
    const tTip = hand.thumbTip.position

    const tMeta = tMcp.sub(tCmc)
    const tProx = tIp.sub(tMcp)
    const tDist = tTip.sub(tIp)

    // Opposition: rotate the thumb metacarpal about the palm's forward axis.
    // ~0 when the thumb lies out to the side, ~90 when swung across the palm.
    const tMetaInPlane = projectOntoPlane(tMeta, forward)
    const opposition = Math.abs(signedAngleAbout(side, tMetaInPlane, forward))
    // Abduction: how far the thumb opens within the palm plane.
    const tMetaOnPalm = projectOntoPlane(tMeta, normal)
    const thumbAbd = signedAngleAbout(forward, tMetaOnPalm, normal)

    const thumb = [
      thumbAbd,
      opposition,
      angleBetween(tMeta, tProx),
      angleBetween(tProx, tDist)
    ]

    return [
      thumb,
      this.measureFinger(hand.indexKnuckle.position, hand.indexMidJoint.position,
                         hand.indexUpperJoint.position, hand.indexTip.position,
                         wrist, forward, normal),
      this.measureFinger(hand.middleKnuckle.position, hand.middleMidJoint.position,
                         hand.middleUpperJoint.position, hand.middleTip.position,
                         wrist, forward, normal),
      this.measureFinger(hand.ringKnuckle.position, hand.ringMidJoint.position,
                         hand.ringUpperJoint.position, hand.ringTip.position,
                         wrist, forward, normal),
      this.measureFinger(hand.pinkyKnuckle.position, hand.pinkyMidJoint.position,
                         hand.pinkyUpperJoint.position, hand.pinkyTip.position,
                         wrist, forward, normal)
    ]
  }

  private measureFinger(mcp: vec3, pip: vec3, dip: vec3, tip: vec3,
                        wrist: vec3, forward: vec3, normal: vec3): number[] {
    const meta = mcp.sub(wrist)
    const prox = pip.sub(mcp)
    const mid = dip.sub(pip)
    const dist = tip.sub(dip)

    const proxOnPalm = projectOntoPlane(prox, normal)
    const abduction = signedAngleAbout(forward, proxOnPalm, normal)

    return [
      abduction,
      angleBetween(meta, prox),
      angleBetween(prox, mid),
      angleBetween(mid, dist)
    ]
  }
}
