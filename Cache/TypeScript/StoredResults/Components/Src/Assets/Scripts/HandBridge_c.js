if (script.onAwake) {
    script.onAwake();
    return;
}
function checkUndefined(property, showIfData) {
    for (var i = 0; i < showIfData.length; i++) {
        if (showIfData[i][0] && script[showIfData[i][0]] != showIfData[i][1]) {
            return;
        }
    }
    if (script[property] == undefined) {
        throw new Error("Input " + property + " was not provided for the object " + script.getSceneObject().name);
    }
}
// @input string serverUrl = "ws://192.168.7.148:8765, ws://192.168.124.7:8765" {"hint":"Bridge address(es). Comma-separate several and the Lens cycles through them on each retry -- useful because the network can hand the PC a new IP every so often. Run 'py netcheck.py' on the PC for the current one."}
// @input string handToTrack = "right" {"hint":"Which of YOUR hands drives the robot. The robot is a DG-5F-R (right hand), so 'right' maps straight across; 'left' is mirrored automatically.", "widget":"combobox", "values":[{"label":"right", "value":"right"}, {"label":"left", "value":"left"}]}
// @input bool autoSwitchHand {"hint":"Tick to follow whichever hand is visible, switching automatically. The hand above is only the starting preference. Left-hand input is mirrored so the robot moves the same way either way."}
// @input float sendRateHz = 60 {"hint":"Send rate in Hz. 60 matches the bridge's default control loop."}
// @input Component.Text statusText {"hint":"Optional but STRONGLY recommended: a Text component to show connection status on-device. Park it under the Camera so it is always visible."}
// @input bool debugLog {"hint":"Also print status to the Logger panel (only visible while tethered to Lens Studio)."}
if (!global.BaseScriptComponent) {
    function BaseScriptComponent() {}
    global.BaseScriptComponent = BaseScriptComponent;
    global.BaseScriptComponent.prototype = Object.getPrototypeOf(script);
    global.BaseScriptComponent.prototype.__initialize = function () {};
    global.BaseScriptComponent.getTypeName = function () {
        throw new Error("Cannot get type name from the class, not decorated with @component");
    };
}
var Module = require("../../../../Modules/Src/Assets/Scripts/HandBridge");
Object.setPrototypeOf(script, Module.HandBridge.prototype);
script.__initialize();
let awakeEvent = script.createEvent("OnAwakeEvent");
awakeEvent.bind(() => {
    checkUndefined("serverUrl", []);
    checkUndefined("handToTrack", []);
    checkUndefined("autoSwitchHand", []);
    checkUndefined("sendRateHz", []);
    checkUndefined("debugLog", []);
    if (script.onAwake) {
       script.onAwake();
    }
});
