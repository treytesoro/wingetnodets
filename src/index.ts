
import { 
    WebConfig,
    WingetMongo, 
    ServerConfig 
} from './WingetMongo';
import { WingetWeb } from './WingetWeb';
import * as process from 'process';
import * as fs from 'fs';

let wgweb:WingetWeb = undefined;

// If running in a docker, read from environment vars
if (process.env.WGN_ISDOCKER) {
    console.log("Detected a docker environment.");
    console.log("Loading configuration from environment.");
    
    // make sure certs are in path
    if(!fs.existsSync('/certs')) {
        console.warn("Could not find web server certificates.");
        process.exit();
    }

    let config:ServerConfig = ServerConfig.loadFromEnv();

    wgweb = new WingetWeb(config);
    wgweb.start();
}
else {
    let config: ServerConfig = require('../noclone/config.json') as ServerConfig;
    wgweb = new WingetWeb(config);
    wgweb.start();
}

// let wgweb = new WingetWeb(config);
// wgweb.start();