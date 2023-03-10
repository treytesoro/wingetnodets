import * as express from "express";
import * as fs from "fs";
import * as https from "https";
import { 
    Filter, 
    Inclusion, 
    ISDEBUG, 
    ManifestSearch, 
    Package, 
    Query, 
    SearchResult, 
    ServerConfig, 
    WebConfig, 
    WingetMongo } from "./WingetMongo";
import * as process from  "process";
import { spawn } from "child_process";

/**
 * The server data is returned from the /information endpoint
 */
interface ServerData {
    /**
     * A server data object should contain a source id a supported version array
     */
    Data:{ 
        /**
         * @param SourceIdentifier
         * An immuntable server ID
         * @param ServerSupportedVersions
         * An array of supported versions
         */
        SourceIdentifier:string;
        ServerSupportedVersions:string[];
     }
}

const OKSTATUS:any = {
    status: 'ok'
}
const ERRORSTATUS:any = {
    status: 'error'
}

export class WingetWeb {
    private app = express();
    private sslServer?:https.Server = null;
    

    constructor(private config:ServerConfig) { }

    /**
     * Starts up the REST server
     */
    start():void {
        let wconfig:WebConfig = this.config.Server.WebConfig;
        let mg = new WingetMongo(this.config);
        this.configExpress();
        this.createExpressEndpoints();

        this.app.listen(wconfig.httpPort, ()=>{
            console.log(`HTTP  | Web server listening on ${wconfig.httpPort}`);
        });

        this.sslServer = this.sslBegin();
    }

    sslBegin():https.Server {
        let wconfig:WebConfig = this.config.Server.WebConfig;
        if(wconfig.httpsPort !== undefined) {
            if(fs.existsSync(wconfig.SSL.privatekey) && fs.existsSync(wconfig.SSL.publickey)) {
                let ssloptions = {
                    key:  fs.readFileSync(wconfig.SSL.privatekey, 'utf8'),
                    cert: fs.readFileSync(wconfig.SSL.publickey, 'utf8')
                };
                
                let httpsServer = https.createServer(ssloptions, this.app);
                httpsServer.listen(wconfig.httpsPort, () => {
                    console.log(`HTTPS | Web server listening on ${wconfig.httpsPort}`);
                    return httpsServer;
                });
                
            }
            else {
                console.warn("Certicates not found!");
                return null;
            }
        }
        else {
            console.warn("HTTPS not enabled");
            return null;
        }
    }

    /**
     * Configure Node express and any middleware
     */
    private configExpress():void {
        this.app.use(this.middleman());
        this.app.use(express.json());
    }

    /**
     * Just a custom middleware to inspect, modify, or
     * do some custom logging for every endpoint.
     * @param req 
     * @param res 
     * @param next 
     */
    middleman(req?:any, res?:any, next?:any):any {
        return (req?:any, res?:any, next?:any) => {
            if (ISDEBUG) {
                console.log("Endpoint called");
                console.trace(req.params);
                console.trace(req.query);
            }
            next();
        }
    }

    /**
     * Express endpoints 
     */
    private createExpressEndpoints():void {
        this.app.get('/', (req, res) => {
            //res.status(200).json({ 'status': 'ok' });
            res.status(200).sendFile("/app/client/index.html");
        });

        this.app.get('/getpowershells', (req, res) => {
            if (fs.existsSync(`/app/powershellHelpers.zip`)) {
                res.status(200).sendFile(`/app/powershellHelpers.zip`);
            }
            else {
                res.status(404).json(ERRORSTATUS);
            }
        });

        this.app.get('/api', (req, res) => {
            // When adding a source, winget-cli expects a 200 response.
            res.status(200).json(OKSTATUS);
        });
        
        this.app.get('/api/information', (req, res) => {
            if (ISDEBUG) console.log("information");
            res.status(200).json(
                {
                    Data: {
                        SourceIdentifier: this.config.Server.serverID,
                        ServerSupportedVersions: this.config.Server.supportedApiVersions
                    }
                } as ServerData
            );
        });
        
        this.app.post('/api/manifestSearch', async (req, res) => {
            if (ISDEBUG) console.log("manifestSearch");
            let wingetmongo = new WingetMongo(this.config);
            
            let matches:Package[] = [] as Package[];
        
            let keyword = '';
            let matchtype:("Exact"|"Substring"|undefined) = undefined;
        
            // A Query in the body indicates a winget-cli search request
            // See the docs folder for an example of the request format
            let queryobject:Query = req.body.Query
            if (queryobject) {
                if(ISDEBUG) console.log("Query type search");
                keyword = queryobject.KeyWord ? queryobject.KeyWord : '';
                matchtype = queryobject.MatchType ? queryobject.MatchType : undefined;
                matches = await wingetmongo.MongoQuery('packages', keyword, matchtype);
            }
        
            // An Inclusions in the body indicates a winget-cli install request
            // See the docs folder for an example of the request format
            let inclusions:Inclusion[]|undefined = req.body.Inclusions;
            if (inclusions) {
                if(ISDEBUG) console.log("Inclusion type search");
                matches = await wingetmongo.MongoInclusions('packages', inclusions);
            }

            let filters:Filter[]|undefined = req.body.Filters;
            if (filters) {
                if(ISDEBUG) console.log("Filter type search");
                matches = await wingetmongo.MongoInclusions('packages', inclusions);
            }
        
            if (ISDEBUG) console.log("=================================================");
            if (ISDEBUG) console.log(JSON.stringify(matches, null, 4));
            if (ISDEBUG) console.log("=================================================");
        
            /**
             * Generate a ManifestSearch from a Package array
             * 
             * The different search types (Query, Inclusion, Filter),
             * have very similar return formats. This looks
             * confusing, so fix this later.
             * 
             * Query = search
             * Inclusion = install
             * Filter = search with filter
             * --There are probably additional search types
             * --that I either need to find in the official docs,
             * --or just test with fiddler or something.
             * --Inclusion with filter may be one.
             */
            let json:ManifestSearch = {
                Data: [] as SearchResult[]
            }

            if (matches.length > 0) {
                let dobject:SearchResult;
                for (let i = 0; i < matches.length; i++) {
                    if (i == 0 && inclusions !== undefined) {
                        dobject = {
                            PackageIdentifier: matches[i].PackageIdentifier,
                            PackageName: matches[i].PackageName,
                            Publisher: matches[i].Publisher,
                            PackageVersion: matches[i].PackageVersion,
                            PackageLocale: matches[i].PackageLocale,
                            Channel: 'unused',
                            Versions: [] as any as [{ PackageVersion:string}]
                        };
                    }
                    else if (filters !== undefined || queryobject !== undefined) {
                        dobject = {
                            PackageIdentifier: matches[i].PackageIdentifier,
                            PackageName: matches[i].PackageName,
                            Publisher: matches[i].Publisher,
                            PackageVersion: matches[i].PackageVersion,
                            PackageLocale: matches[i].PackageLocale,
                            Channel: 'unused',
                            Versions: [] as any as [{ PackageVersion:string}]
                        };
                    }
                    dobject.Versions.push({
                        PackageVersion: matches[i].PackageVersion
                    });
        
                    json.Data.push(dobject);
                }

                if (ISDEBUG) {
                    fs.writeFile("./output.json", JSON.stringify(json), (err) => {
                        console.log(err);
                    });
                }

                res.status(200).json(json);
            }
            else {
                // return zero matches
                res.status(204).json({});
            }
        });
        
        /**
         * This endpoint is only meant for testing packages locally
         * during development. This should be disabled in a production
         * environment. Packages should be delivered from a dedicated content
         * server (GitLFS, OneDrive, or any onprem web accessible content server).
         */
        if(this.config.ServePackages) {
            this.app.get('/api/downloads/:pkgname', (req, res) => {
                if (fs.existsSync(`${this.config.PackagesPath}${req.params.pkgname}`)) {
                    res.sendFile(`${this.config.PackagesPath}${req.params.pkgname}`);
                }
                else {
                    // return an empty object to indicate no package found.
                    res.status(200).json({});
                }
            });
        }
        
        this.app.get('/api/packages', (req, res) => {
            res.status(200).json(OKSTATUS);
        });
        
        /**
         * The winget install endpoint.
         * NOTE: winget will first perform a search. If it returns a single
         * item, the ID of that item is passed to this endpoint.
         * 
         * The does not get called by winget install until a search returns a single
         * item. If more than one item is returned, you have to keep adding filters
         * until a single item is returned. If an item is found in multiple sources,
         * you will also need to specify the source on the winget command line.
         */
        this.app.get('/api/packageManifests/:id', async (req, res) => {
            if (ISDEBUG) console.log("packagemanifests");
            let wingetmongo = new WingetMongo(this.config);

            if (ISDEBUG) console.log("=====================================");
            if (ISDEBUG) console.log(req.params.id);
            if (ISDEBUG) console.log(req.query.Version);
            let data = null;
            try {
                // should always be exact here.
                data = await wingetmongo.MongoGetManifest('packages', req.params.id, 'Exact', { Version: req.query.Version });
                if (ISDEBUG) console.log("PACKAGE MANIFEST DATA");
                if (ISDEBUG) console.log(data);
            }
            catch (err) {
                if (ISDEBUG) console.log(err);
            }
            if (ISDEBUG) console.log("=====================================");
        
            let json = {
                Data: {
                    PackageIdentifier: '',
                    Versions: []
                }
            }
            data.forEach(pkg => {
                if (json.Data.PackageIdentifier == '') {
                    json.Data.PackageIdentifier = pkg.PackageIdentifier;
                }
                let version = {
                    'PackageVersion': pkg.PackageVersion,
                    'DefaultLocale': {
                        'PackageLocale': pkg.PackageLocale,//
                        'PackageName': pkg.PackageName,//
                        'Publisher': pkg.Publisher,//
                        'Description': pkg.Description,
                        'License': pkg.License,//
                        'Agreements': pkg.Agreements,
                        'ShortDescription': pkg.ShortDescription,//
                        'Copyright': pkg.Copyright,
                        'PrivacyUrl': pkg.PrivacyUrl,
                        'PublisherUrl': pkg.PublisherUrl,
                        'PublisherSupportUrl': pkg.PublisherSupportUrl,
                        'Tags': pkg.Tags,
                        'Author': pkg.Author,
                        'PackageUrl': '',
                        'CopyrightUrl': ''
                    },
                    'Installers': pkg.Installers,
                    'Commands': pkg.Commands ? pkg.Commands : []
                }
                json.Data.Versions.push(version);
            });
        
            res.status(200).json(json);
        });
        
        /**
         * The upload endpoint. At this time I'm not ingesting package yaml files.
         * This just stores the json document. Is it even necessary to 
         * create the yaml source tree? This part of the official restsource reference
         * is something I need to dig into.
         */
        this.app.post('/api/package', (req, res) => {
            if (ISDEBUG) console.log(req);
            let wingetmongo = new WingetMongo(this.config);
            let pkg = req.body as Package;
            if(ISDEBUG) {
                console.log("Inserting new package");
                console.trace(pkg);
            }

            wingetmongo.MongoInsertDocument('packages', pkg).then(
                result => {
                    if (ISDEBUG) console.log(result);
                    res.status(200).json(OKSTATUS);
                }
            ).catch(
                err => {
                    if (ISDEBUG) console.log(err);
                    res.status(200).json(ERRORSTATUS);
                }
            ).finally(
                () => {
                    
                }
            );
        });

        this.app.post('/getcerts', (req, res)=>{
            console.log(req.body);
            let gencakey = spawn('/ca/gencakey.sh',[ req.body.capw ],{
                cwd: "/ca"
            });

            let valuestemplate:string = fs.readFileSync("/ca/values-template.cfg", {
                encoding: 'utf-8'
            });

            let webext:string = fs.readFileSync("/ca/webserver-template.ext", {
                encoding: 'utf-8'
            });

            valuestemplate = valuestemplate.replace("{countrycode}", req.body.countrycode)
            .replace("{locality}", req.body.locality)
            .replace("{organization}", req.body.organization)
            .replace("{cn}", req.body.cacn)
            .replace("{email}", req.body.caemail)
            .replace("{pass}", req.body.capw);

            console.log(valuestemplate);

            let sanstring = "";
            let sans = req.body.san.split(',');
            for(let i=0; i<sans.length; i++) {
                sanstring+=`DNS.${i} = ${sans[i].trim()}\n`;
            }

            webext = webext.replace("{san}", sanstring);

            fs.writeFileSync("/ca/tmpvalues.cfg", valuestemplate, {
                encoding: "utf-8"
            });

            fs.writeFileSync("/ca/tmpwebserver.ext", webext, {
                encoding: "utf-8"
            });

            gencakey.on('close', (code)=>{
                console.log(`Gencakey exited: ${code}`);
                let genrootcert = spawn('/ca/genrootcert.sh',[ req.body.capw, "/ca/tmpvalues.cfg" ],{
                    cwd: "/ca"
                });
                genrootcert.on('close', (code)=>{
                    console.log(`Genrootcert exited: ${code}`);
                    let genkey = spawn('/ca/genkey.sh',[
                        req.body.capw,
                        "/ca/tmpvalues.cfg",
                        "/ca/tmpwebserver.ext"
                    ],{
                        cwd: "/ca"
                    });
                    genkey.on('close', (code)=>{
                        console.log(`Genkey existed ${code}`);
                        fs.copyFileSync('/ca/webserver.crt', '/certs/server.crt');
                        fs.copyFileSync('/ca/webserver.key', '/certs/server.key');

                        //if(this.sslServer!=null) {
                            this.sslServer = this.sslBegin();
                        //}
                        let zip = spawn('/ca/zipcerts.sh',{
                            cwd: "/ca"
                        })
                        zip.on('close', (code)=>{
                            console.log(`Zipcerts existed ${code}`);
                            let stats=fs.statSync('/ca/newcerts.zip');
                            // res.sendFile('/ca/newcerts.zip', {
                            //     headers: {
                            //         'Content-Type': 'application/octet-steam',
                            //         'Content-Length': stats["size"]
                            //     }
                            // })
                            let data = fs.readFileSync('/ca/newcerts.zip');
                            console.log(data.byteLength);
                            console.log(data.length);
                            res.set("Content-Type", "application/zip");
                            res.set('Content-Disposition',`attachment; filename=newcerts.zip`);
                            res.set('Content-Length', data.byteLength);
                            res.send(data);
                        });
                    });
                });
            });
            //res.status(200).json(OKSTATUS);
        });

        this.app.get('/:path', (req, res)=>{
            //console.log("static path");
            //console.log(req.params.path);
            if (fs.existsSync(`/app/client/${req.params.path}`)) {
                res.sendFile(`/app/client/${req.params.path}`);
            }
            else {
                res.status(404).send("NOT FOUND");
            }
        });
    }
}