
import { 
    WebConfig,
    WingetMongo, 
    ServerConfig 
} from './WingetMongo';
import { WingetWeb } from './WingetWeb';

const config:ServerConfig = require('../noclone/config.json') as ServerConfig;

let wgweb = new WingetWeb(config);
wgweb.start();