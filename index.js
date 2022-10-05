// read .env
require('dotenv').config();
// require websocket library
const WebSocket = require('ws');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// open websocket with headers
const ws = new WebSocket(`wss://${process.env.MATTERMOST_URL}/api/v4/websocket?connection_id&sequence_number=0`, {
    headers: {
        'Origin': 'https://' + process.env.MATTERMOST_URL,
        'Host': process.env.MATTERMOST_URL,
        'Accept': '*/*',
        'Cookie': `MMAUTHTOKEN=${process.env.MMAUTHTOKEN};`
    }
});

let isReady = false;
let seqNumb = 1;

// on open
ws.on('open', function open() {
    log('connected', "info");
});

// on message
ws.on('message', function incoming(data) {

    const message = data.toString();
    const json = JSON.parse(message);

    log(json, "debug");

    if(json.event === 'hello') {
        isReady = true;

        const getStatus = {
            "seq": seqNumb,
            "action": "get_statuses",
            "data": {}
        }
        ws.send(JSON.stringify(getStatus));
        seqNumb++
    }

    if(json.event === 'typing') {
        sendTyping(json.broadcast.channel_id);
        if(process.env.ENABLE_POST_ON_TYPING === "true"){
            postTyping(json.broadcast.channel_id, json.data.user_id);
        }
    }

});

// on close
ws.on('close', function close() {
    isReady = false;
    console.log("closed", "info");
})

// on error
ws.on('error', function error(err) {
    log(err, "error");
    isReady = false;
})


const sendTyping = (channelID) => {
    if(isReady) {
        const typing = {
            "action": "user_typing",
            "seq": seqNumb,
            "data": {
                "channel_id": channelID,
                "parent_id": "",
            }
        }
        log(typing, "debug");
        ws.send(JSON.stringify(typing));
        seqNumb++
        log('typing', "info");
}
}

const postTyping = async (channelID, userID) => {

    let user = await makeRequest(`https://${process.env.MATTERMOST_URL}/api/v4/users/${userID}`, "GET");
    log(user.username, "info");
    await makeRequest(`https://${process.env.MATTERMOST_URL}/api/v4/posts`, "POST", {
        "channel_id": channelID, 
        "message": process.env.POST_ON_TYPING_MESSAGE ? process.env.POST_ON_TYPING_MESSAGE.replaceAll("%user%", "@" + user.username) : `@${user.username} is typing...`,
    });
    log("posted", "info");
}

const makeRequest = async (url, method, body = null) => {
    let res;
    if(method.toUpperCase() === "GET") {
        res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MMAUTHTOKEN}`,
                'Cookie': `MMAUTHTOKEN=${process.env.MMAUTHTOKEN};`
            },
        })
    } else {
        res = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MMAUTHTOKEN}`,
                'Cookie': `MMAUTHTOKEN=${process.env.MMAUTHTOKEN};`
            },
            body: JSON.stringify(body)
        })
    }
    let json = await res.json()
    log(json, "debug");
    return json
}


const log = (message, reqlevel) => {
    const levelNumbMapper = {
        "debug": 0,
        "info": 1,
        "warn": 2,
        "error": 3,
        "none": 4,
    }
    if(levelNumbMapper[process.env.LOG_LEVEL.toLowerCase() || "none"] <= levelNumbMapper[reqlevel.toLowerCase()]) {
        try{
            console.log(`[${reqlevel.toUpperCase()}] - ${new Date().toISOString()} | ${typeof message == "object" ? JSON.stringify(message) : message}`);

        }catch(err){
            console.log(`[${reqlevel.toUpperCase()}] - ${new Date().toISOString()} | ${message}`);
        }
    }
}

