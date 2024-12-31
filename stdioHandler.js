const {parentPort} = require('worker_threads');
const prompt = require("prompt-sync")({ sigint: true });

while (true) {
    const input = prompt();
    if (input === "stop") {
        parentPort.postMessage("STOP");
        break;
    }
}