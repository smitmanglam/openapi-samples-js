/*jslint this: true, browser: true, for: true, long: true, bitwise: true */
/*global window console WebSocket accountKey run processError apiUrl displayVersion */

let connection;
let lastTradeMessageId;

/**
 * This is an example of getting the trading settings of an instrument.
 * @return {void}
 */
function createConnection() {
    const accessToken = document.getElementById("idBearerToken").value;
    const contextId = encodeURIComponent(document.getElementById("idContextId").value);
    const streamerUrl = "wss://gateway.saxobank.com/sim/openapi/streamingws/connect?authorization=" + encodeURIComponent("BEARER " + accessToken) + "&contextId=" + contextId;
    if (contextId !== document.getElementById("idContextId").value) {
        console.error("Invalid characters in Context ID.");
        throw "Invalid characters in Context ID.";
    }
    connection = new WebSocket(streamerUrl);
    connection.binaryType = "arraybuffer";
    console.log("Connection created with binaryType '" + connection.binaryType + "'. ReadyState: " + connection.readyState);
    // Documentation on readyState: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
    // 0 = CONNECTING, 1 = OPEN
}

/**
 * This is an example of getting the trading settings of an instrument.
 * @return {void}
 */
function startListener() {

    /**
     * Creates a Long from its little endian byte representation (function is part of long.js - https://github.com/dcodeIO/long.js).
     * @param {!Array.<number>} bytes Little endian byte representation
     * @param {boolean=} unsigned Whether unsigned or not, defaults to signed
     * @returns {number} The corresponding Long value
     */
    function fromBytesLE(bytes, unsigned) {
        const low = bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24;
        const high = bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24;
        const TWO_PWR_16_DBL = 1 << 16;
        const TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;
        if (unsigned) {
            return ((high >>> 0) * TWO_PWR_32_DBL) + (low >>> 0);
        }
        return high * TWO_PWR_32_DBL + (low >>> 0);
    }

    /**
     * Parse the incoming messages. Documentation on message format: https://www.developer.saxo/openapi/learn/plain-websocket-streaming#PlainWebSocketStreaming-Receivingmessages
     * @param {Object} data The received stream message
     * @returns {void}
     */
    function parseMessageFrame(data) {
        let index = 0;
        while (index < data.byteLength) {
            const message = new DataView(data);
            // First 8 bytes make up the message id, which is a 64 bit integer
            const messageId = fromBytesLE(new Uint8Array(data, index, 8));
            index += 8;
            // 2 bytes make up the reserved field. This field (message.getInt16(index)) is reserved for future use and can be ignored by the client
            index += 2;
            // 1 byte makes up the reference id length as an 8 bit integer - the reference id has a max length of 50 chars
            const referenceIdSize = message.getInt8(index);
            index += 1;
            // n bytes make up the reference id, which is an ASCII string
            const referenceIdBuffer = new Int8Array(data.slice(index, index + referenceIdSize));
            const referenceId = String.fromCharCode.apply(String, referenceIdBuffer);
            index += referenceIdSize;
            // 1 byte makes up the payload format. The value 0 indicates that the payload format is Json
            const payloadFormat = message.getUint8(index);
            index += 1;
            // 4 bytes make up the payload length as a 32 bit integer
            const payloadSize = message.getUint32(index, true);
            index += 4;
            // n bytes make up the actual payload - in the case of the payload format being Json, this is a UTF8 encoded string
            const payloadBuffer = new Int8Array(data.slice(index, index + payloadSize));
            if (payloadFormat === 0) {
                const payload = JSON.parse(String.fromCharCode.apply(String, payloadBuffer));
                switch (referenceId) {
                case "MyTradeMessageEvent":
                    lastTradeMessageId = payload[0].MessageId;
                    console.log("Streaming trade message event " + messageId + " received: " + JSON.stringify(payload, null, 4));
                    break;
                case "_heartbeat":
                    console.debug("Heartbeat event " + messageId + " received: " + JSON.stringify(payload, null, 4));
                    break;
                default:
                    console.error("No processing implemented for message with reference " + referenceId);
                }
            } else {
                console.error("Unsupported payloadFormat: " + payloadFormat);
            }
            index += payloadSize;
        }
    }

    connection.onopen = function () {
        console.log("Streaming connected");
    };
    connection.onclose = function () {
        console.log("Streaming disconnected");
    };
    connection.onerror = function (evt) {
        console.error(evt);
    };
    connection.onmessage = function (messageFrame) {
        parseMessageFrame(messageFrame.data);
    };
    console.log("Connection subscribed to events. ReadyState: " + connection.readyState);
}

/**
 * This is an example of setting the trading settings of an instrument.
 * @return {void}
 */
function subscribe() {
    const data = {
        "ContextId": document.getElementById("idContextId").value,
        "ReferenceId": "MyTradeMessageEvent",
        "Format": "application/json",
    };

    fetch(
        apiUrl + "/trade/v1/messages/subscriptions",
        {
            "method": "POST",
            "headers": {
                "Authorization": "Bearer " + document.getElementById("idBearerToken").value,
                "Content-Type": "application/json"
            },
            "body": JSON.stringify(data)
        }
    ).then(function (response) {
        if (response.ok) {
            console.log("Subscription created with readyState " + connection.readyState + " and data '" + JSON.stringify(data, null, 4) + "'.");
        } else {
            processError(response);
        }
    }).catch(function (error) {
        console.error(error);
    });
}

function markAsRead() {
    fetch(
        apiUrl + "/trade/v1/messages/seen/" + lastTradeMessageId,
        {
            "method": "PUT",
            "headers": {
                "Authorization": "Bearer " + document.getElementById("idBearerToken").value,
                "Content-Type": "application/json"
            }
        }
    ).then(function (response) {
        if (response.ok) {
            console.log("Message " + lastTradeMessageId + " marked as 'read'.");
        } else {
            processError(response);
        }
    }).catch(function (error) {
        console.error(error);
    });
}

function unsubscribe() {
    fetch(
        apiUrl + "/trade/v1/messages/subscriptions/" + encodeURIComponent(document.getElementById("idContextId").value) + "/MyTradeMessageEvent",
        {
            "method": "DELETE",
            "headers": {
                "Authorization": "Bearer " + document.getElementById("idBearerToken").value,
                "Content-Type": "application/json"
            }
        }
    ).then(function (response) {
        if (response.ok) {
            console.log("Unsubscribed. You can subscribe for updates again.");
        } else {
            processError(response);
        }
    }).catch(function (error) {
        console.error(error);
    });}

(function () {
    document.getElementById("idContextId").value = "MyApp_" + Date.now();  // Some unique value
    document.getElementById("idBtnCreateConnection").addEventListener("click", function () {
        run(createConnection);
    });
    document.getElementById("idBtnStartListener").addEventListener("click", function () {
        run(startListener);
    });
    document.getElementById("idBtnSubscribe").addEventListener("click", function () {
        run(subscribe);
    });
    document.getElementById("idBtnMarkAsRead").addEventListener("click", function () {
        run(markAsRead);
    });
    document.getElementById("idBtnUnsubscribe").addEventListener("click", function () {
        run(unsubscribe);
    });
    displayVersion("trade");
}());