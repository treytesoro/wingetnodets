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

export class WingetWeb {
    private app = express();

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

        if(wconfig.httpsPort !== undefined) {
            const ssloptions = {
                key:  fs.readFileSync(wconfig.SSL.privatekey, 'utf8'),
                cert: fs.readFileSync(wconfig.SSL.publickey, 'utf8')
            };
            
            const httpsServer = https.createServer(ssloptions, this.app);
            httpsServer.listen(wconfig.httpsPort, () => {
                console.log(`HTTPS | Web server listening on ${wconfig.httpsPort}`);
            });
        }
        else {
            console.warn("HTTPS not enabled");
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
                res.sendFile(`/app/powershellHelpers.zip`);
            }
            else {
                res.status(200).json({});
            }
        });

        this.app.get('/api', (req, res) => {
            // When adding a source, winget-cli expects a 200 response.
            res.status(200).json({ 'status': 'ok' });
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
                    res.status(200).json({});
                }
            });
        }
        
        this.app.get('/api/packages', (req, res) => {
            res.status(200).json({});
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
                }
            ).catch(
                err => {
                    if (ISDEBUG) console.log(err);
                }
            ).finally(
                () => {
                    res.status(200).json({ status: 'ok' });
                }
            );
        });
    }
}