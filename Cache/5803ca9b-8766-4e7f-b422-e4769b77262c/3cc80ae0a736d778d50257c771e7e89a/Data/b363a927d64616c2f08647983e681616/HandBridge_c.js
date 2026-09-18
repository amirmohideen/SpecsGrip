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
// @input string serverUrl = "ws://192.168.124.7:8765" {"hint":"Bridge address. Use the PC's Wi-Fi IP -- not 127.0.0.1 -- and make sure the Spectacles are on the same network."}
// @input string handToTrack = "right" {"hint":"Which of YOUR hands drives the robot. The robot itself is a DG-5F-R (right hand).", "widget":"combobox", "values":[{"label":"right", "value":"right"}, {"label":"left", "value":"left"}]}
// @input float sendRateHz = 60 {"hint":"Send rate in Hz. 60 matches the bridge's default control loop."}
// @input bool debugLog {"hint":"Print measured angles to the Logger panel once a second."}
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
    checkUndefined("sendRateHz", []);
    checkUndefined("debugLog", []);
    if (script.onAwake) {
       script.onAwake();
    }
});
