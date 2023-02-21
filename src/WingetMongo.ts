import * as Mongo from 'mongodb';
import * as express from 'express';
import * as https from 'https';
import * as fs from 'fs';

const ISDEBUG=false;

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
        ServerSupportedVersions:string;
     }
}

/**
 * A Query for simple searches
 */
interface Query {
    KeyWord:string;
    MatchType:"Exact"|"Substring"|undefined;
}

/**
 * RequestMatch contains the same properties
 * as a Query. This type is used in Inclusions and Filters
 */
interface RequestMatch extends Query {
    // Currently this is just placeholder alias for Query.
    // If we find the definitions to diverge, we can
    // add new properties here or define this interface
    // as a new base type.
}

interface Inclusion {
    PackageMatchField:string;
    RequestMatch: RequestMatch
}

interface Filter extends Inclusion {}

/**
 * This is represents a Package as written
 * to the Mongo database.
 */
interface Package {
    _id: string,
    PackageIdentifier: string,
    PackageVersion: string,
    PackageLocale: 'en-US'|string,
    PackageName: string,
    Publisher: string,
    Description: string,
    ShortDescription: string,
    Copyright: string,
    PrivacyUrl: string,
    PublisherUrl: string,
    PublisherSupportUrl: string,
    Tags: string[],
    Author: string,
    License: string,
    Installers: Installer[]
}

interface Installer {
    Architecture: 'x64'|'x86'|'arm',
    InstallerType: 'msi'|'msix'|'exe'|'nullsoft'|'zip'|'wix'|string,
    InstallerUrl: string,
    InstallerSha256: string
    InstallMode?: 'silent'|'silentWithProgress'|string,
    InstallerSwitches: {
        Silent?: string
    }
}

interface SearchResult {
    PackageIdentifier:string,
    PackageName:string,
    Publisher:string,
    PackageVersion:string,
    PackageLocale:string,
    Channel: string,
    Versions?: [
        {
            PackageVersion: string
        }
    ]
}

interface ManifestSearch {
    Data: SearchResult[];
}

export class WingetWeb {
    app = express();

    constructor(private config:ServerConfig) {

    }

    start():void {
        let wconfig:WebConfig = this.config.Server.WebConfig;
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
            res.status(200).json({ 'status': 'ok' });
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
        this.app.get('/api/downloads/:pkgname', (req, res) => {
            if (fs.existsSync(`${this.config.PackagesPath}${req.params.pkgname}`)) {
                res.sendFile(`${this.config.PackagesPath}${req.params.pkgname}`);
            }
            else {
                res.status(200).json({});
            }
        });
        
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
            wingetmongo.MongoInsertDocument('packages', req.body).then(
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

export class WingetMongo {
    private mongoclient:Mongo.MongoClient;

    constructor(config:ServerConfig) {
        this.mongoclient = new Mongo.MongoClient(config.MongoConnectString)
    }

    test(): void {
        this.mongoclient.connect()
        .then(
            async client => {
                let dbo:Mongo.Db = client.db('winget');
                let packages = await dbo.collection('packages').find({}).toArray();
                console.log(packages);
            }
        )
        .catch(
            err => {
                console.warn(err);
            }
        )
    }

    /**
     * Performs a "Query" type search for Packages
     * This method is called during a manifestSearch.
     * @param collection 
     * Should currently be "packages"
     * @param KeyWord 
     * The search term
     * @param MatchType 
     * A Query search can perform Exact and Substring searches
     * @returns 
     * An array of Packages
     */
    MongoQuery(collection:string = 'packages', KeyWord:string = '', MatchType:"Exact"|"Substring"|undefined): Promise<Package[]> {
        return new Promise((resolve, reject) => {
            if(MatchType === undefined){
                 reject("MatchType was not supplied.");
                 return;
            }

            this.mongoclient.connect()
                .then(
                    async db => {
                        var dbo = db.db("winget");
                        try {
                            let query = {};
                            if (MatchType === "Exact") {
                                query = {
                                    $or: [
                                        { $text: { $search: `\"${KeyWord}\"` } },
                                        { Tags: { $all: [KeyWord] } }
                                    ]
                                }
                            }
                            else if (MatchType === "Substring") {
                                query = {
                                    $or: [
                                        { PackageName: new RegExp(`${KeyWord}`, 'ig') },
                                        { PackageIdentifier: new RegExp(`${KeyWord}`, 'ig') },
                                        { Tags: { $all: [KeyWord] } }
                                    ]
                                }
                            }
                            let _collection = await dbo.collection(collection);
                            let idxs = await _collection.indexes();
                            let results:Package[] = await dbo.collection(collection).find(query).toArray() as any as Package[];
                            db.close();
                            resolve(results);
                        }
                        catch (err) {
                            reject(err);
                        }
                    }
                )
                .catch(
                    err => {
                        reject(err);
                    }
                )
                .finally(
                    () => { }
                );
        });
    }

    /**
     * Performs an Inclusion or Filter type search for Packages
     * @param collection 
     * Should currently be "packages"
     * @param Inclusions 
     * An array of Inclusions or Filters
     * @returns 
     * An array of Packages
     */
    MongoInclusions(collection:string = 'packages', Inclusions:Inclusion[]|Filter[]):Promise<Package[]> {
        return new Promise((resolve, reject) => {
            this.mongoclient.connect().then(
                async db => {
                    var dbo = db.db("winget");
                    var allresults:Package[] = [] as Package[];
                    for (let inc of Inclusions) {
                        let fieldname = inc.PackageMatchField == "Moniker" ? "Tags" : inc.PackageMatchField;
                        let matchtype = inc.RequestMatch.MatchType;
                        let keyword = inc.RequestMatch.KeyWord;
                        if (matchtype.toUpperCase() === "EXACT") { // I'm not sure if "Exact" should be case-insensitive
                            if (ISDEBUG) console.log("Executing EXACT search");
                            let rgx = new RegExp(`^${keyword}$`, 'ig');
    
                            // wrap fieldname in square brackets - not sure what the library is
                            // doing, but it works.
                            let results:Package[] = (await dbo.collection(collection).find({ [fieldname]: { $regex: rgx } }).toArray()) as any as Package[];
                            allresults = allresults.concat(results);
                        }
                        if (matchtype.toUpperCase() === "CASEINSENSITIVE" ||
                            matchtype.toUpperCase() === "SUBSTRING") {
                            if (ISDEBUG) console.log("Executing CASEINSENSITIVE search");
                            let rgx = new RegExp(`${keyword}`, 'ig');
                            let query = {};
    
                            // Must construct an array text search if we need to search Tags
                            if (fieldname === "Tag") {
                                query = { Tags: { $all: [keyword] } }
                            }
                            else {
                                query = { [fieldname]: { $regex: rgx } };
                            }
    
                            // let results = await dbo.collection(collection).find({[fieldname]: {$regex: rgx}}).toArray();
                            let results:Package[] = (await dbo.collection(collection).find(query).toArray()) as any as Package[];
                            allresults = allresults.concat(results);
                        }
                    }
    
                    resolve(allresults);
                }).catch(
                    err => {
                        reject(err);
                    }
                ).finally(
                    () => { }
                );
        });
    }

    MongoGetManifest(collection = 'packages', KeyWord = '', MatchType = 'Substring', options):Promise<any> {
        if (ISDEBUG) console.log(collection);
        if (ISDEBUG) console.log(KeyWord);
        if (ISDEBUG) console.log(MatchType);
        if (ISDEBUG) console.log(options);
    
        let query:any = { PackageIdentifier: KeyWord }
        if (options) {
            if (options.Version) {
                query.PackageVersion = options.Version;
            }
        }
    
        return new Promise((resolve, reject) => {
            this.mongoclient.connect().then(
                async db => {
                    var dbo = db.db("winget");
                    if (MatchType == 'Substring') {
                        try {
                            let test = await dbo.collection(collection).createIndex({ PackageIdentifier: "text", PackageVersion: "text" });
                            //let idx = await dbo.createIndex( { 'PackageName': "text" } );
                            let SubstringQuery = { $text: { $search: query.PackageIdentifier } };
                            if (ISDEBUG) console.log(JSON.stringify(SubstringQuery));
                            let _collection = await dbo.collection(collection);
                            //let idxs = await _collection.indexes();
                            let results = await dbo.collection(collection).find(SubstringQuery).toArray();
                            db.close();
                            if (ISDEBUG) console.log("MongoGetManifest");
                            if (ISDEBUG) console.log(results);
                            resolve(results);
                        }
                        catch (err) {
                            if (ISDEBUG) console.log(err);
                            reject(err);
                        }
                    }
                    else {
                        let results = await dbo.collection(collection).find(query).toArray();
                        if (ISDEBUG) console.log(JSON.stringify(query));
                        if (ISDEBUG) console.log("MongoGetManifest");
                        if (ISDEBUG) console.log(results);
                        db.close();
                        resolve(results);
                    }
                }).catch(
                    err => {
                        if (ISDEBUG) console.log("COULD NOT CONNECT TO MONGO");
                        if (ISDEBUG) console.log(err);
                        reject(err);
                    }
                ).finally(
                    () => { }
                );
        });
    }

    MongoInsertDocument(collection = 'packages', document):Promise<any> {
        return new Promise((resolve, reject) => {
            this.mongoclient.connect().then(
                async (db) => {
                    try {
                        var dbo = db.db("winget");
                        let packages = await dbo.collection(collection);
                        let pkg = await packages.insertOne(document);
                        resolve(pkg.insertedId);
                    }
                    catch (err) {
                        reject(err);
                    }
                }
            ).catch(
                err => {
                    reject(err);
                }
            ).finally(
                () => {
                    return;
                }
            );
        });
    }
}

/**
 * Represents a config.json containing the environment settings
 */
export interface ServerConfig {
    Server:{
        serverID:string,
        supportedApiVersions:string,
        WebConfig: WebConfig
    };
    MongoConnectString:string;
    PackagesPath:string;
}
/**
 * The WebConfig portion of a ServerConfig
 */
export interface WebConfig {
    httpPort:number,
    httpsPort?:number,

    SSL?: {
        privatekey:string,
        publickey:string
    }
}