
import { 
    WebConfig,
    WingetWeb, 
    WingetMongo, 
    ServerConfig 
} from './WingetMongo';

const config:ServerConfig = require('../noclone/config.json') as ServerConfig;

let wgweb = new WingetWeb(config);
wgweb.start();