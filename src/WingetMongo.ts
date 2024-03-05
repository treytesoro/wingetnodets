import * as Mongo from 'mongodb';
import * as process from 'process';
// import * as express from 'express';
// import * as https from 'https';
// import * as fs from 'fs';

//export const ISDEBUG=false;

/**
 * A Query for simple searches
 */
export interface Query {
    KeyWord: string;
    MatchType: "Exact" | "Substring" | undefined;
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

export interface Inclusion {
    PackageMatchField: string;
    RequestMatch: RequestMatch
}

export interface Filter extends Inclusion { }

/**
 * This is represents a Package as written
 * to the Mongo database.
 */
export interface Package {
    _id: string,
    PackageIdentifier: string,
    PackageVersion: string,
    PackageLocale: 'en-US' | string,
    PackageName: string,
    Publisher: string,
    Description: string,
    ShortDescription: string,
    Copyright: string,
    PrivacyUrl: string,
    PublisherUrl: string,
    PublisherSupportUrl: string,
    Tags: string[],
    Moniker: string,
    Author: string,
    License: string,
    Installers: Installer[]
}

export interface Installer {
    Architecture: 'x64' | 'x86' | 'arm',
    InstallerType: 'msi' | 'msix' | 'exe' | 'nullsoft' | 'zip' | 'wix' | string,
    InstallerUrl: string,
    InstallerSha256: string
    InstallMode?: 'silent' | 'silentWithProgress' | string,
    InstallerSwitches: {
        Silent?: string
    }
}

export interface SearchResult {
    PackageIdentifier: string,
    PackageName: string,
    Publisher: string,
    PackageVersion: string,
    PackageLocale: string,
    Channel: string,
    Versions?: [
        {
            PackageVersion: string
        }
    ],
    Moniker: string,
    Match: string
}

export interface ManifestSearch {
    Data: SearchResult[];
}

/**
 * Represents a config.json containing the environment settings
 */
export class ServerConfig {
    Server: {
        serverID: string,
        supportedApiVersions: string[],
        WebConfig: WebConfig
    };
    MongoConnectString: string;
    PackagesPath: string;
    ServePackages: boolean;

    public static loadFromEnv(): ServerConfig {
        let newConfig: ServerConfig = {
            Server: {
                serverID: process.env.WGN_SERVERID,
                supportedApiVersions: process.env.WGN_SUPPORTED_VERSIONS.split(','),
                WebConfig: {
                    httpPort: parseInt(process.env.WGN_HTTP_PORT),
                    httpsPort: parseInt(process.env.WGN_HTTPS_PORT),
                    SSL: {
                        privatekey: process.env.WGN_PRIVATEKEYPATH,
                        publickey: process.env.WGN_PUBLICKEYPATH
                    }
                }
            },
            MongoConnectString: process.env.WGN_MONGO_CONNECTIONSTRING,
            PackagesPath: process.env.WGN_PACKAGESPATH + "/",
            ServePackages: process.env.WGN_SERVEPACKAGES == "1" ? true : false
        };
        console.trace(process.env);
        console.trace(newConfig);
        return newConfig;
    }
}

/**
 * The WebConfig portion of a ServerConfig
 */
export interface WebConfig {
    httpPort: number,
    httpsPort?: number,

    SSL?: {
        privatekey: string,
        publickey: string
    }
}

export class WingetMongo {
    private mongoclient: Mongo.MongoClient;

    constructor(config: ServerConfig) {
        let hasPackage: boolean = false;
        //console.log("Checking for mongo");
        this.mongoclient = new Mongo.MongoClient(config.MongoConnectString)
        this.mongoclient.connect()
            .then(
                async db => {
                    let dbo = db.db('winget');
                    try {
                        let cols: Mongo.Collection[] = await dbo.collections();

                        // cols.forEach(
                        //     col=>{
                        //         if(col.collectionName.toUpperCase()=='PACKAGES') {
                        //             hasPackage = true;
                        //         }
                        //     }
                        // });

                        for (let col of cols) {
                            if (col.collectionName.toUpperCase() == 'PACKAGES') {
                                hasPackage = true;
                            }
                        }

                        if (!hasPackage) {
                            console.log("packages collection does not exist");
                            await dbo.createCollection('packages');
                        }
                    }
                    catch (Err) {

                    }
                }
            )
            .catch(
                err => {
                    console.log(err);
                }
            )
    }

    test(): void {
        this.mongoclient.connect()
            .then(
                async client => {
                    let dbo: Mongo.Db = client.db('winget');
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
    MongoQuery(collection: string = 'packages', KeyWord: string = '', MatchType: "Exact" | "Substring" | undefined): Promise<Package[]> {
        return new Promise((resolve, reject) => {
            if (MatchType === undefined) {
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
                            let results: Package[] = await dbo.collection(collection).find(query).toArray() as any as Package[];
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
    MongoInclusions(collection: string = 'packages', Inclusions: Inclusion[] | Filter[]): Promise<Package[]> {
        return new Promise((resolve, reject) => {
            this.mongoclient.connect().then(
                async db => {
                    var dbo = db.db("winget");
                    var allresults: Package[] = [] as Package[];
                    for (let inc of Inclusions) {
                        let fieldname = inc.PackageMatchField;// == "Moniker" ? "Tags" : inc.PackageMatchField;
                        let matchtype = inc.RequestMatch.MatchType;
                        let keyword = inc.RequestMatch.KeyWord;
                        if (matchtype.toUpperCase() === "EXACT") { // I'm not sure if "Exact" should be case-insensitive
                            if (globalThis.ISDEBUG) console.log("Executing EXACT search");
                            let rgx = new RegExp(`^${keyword}$`, 'ig');

                            // wrap fieldname in square brackets - not sure what the library is
                            // doing, but it works.
                            let results: Package[] = (await dbo.collection(collection).find({ [fieldname]: { $regex: rgx } }).toArray()) as any as Package[];
                            results.forEach(r => {
                                let found = false;
                                for (let i = 0; i < allresults.length; i++) {
                                    if (r._id.toString() === allresults[i]._id.toString()) {
                                        found = true;
                                    }
                                }
                                if (!found) {
                                    allresults.push(r);
                                }
                            });
                            //allresults = allresults.concat(results);
                        }
                        if (matchtype.toUpperCase() === "CASEINSENSITIVE" ||
                            matchtype.toUpperCase() === "SUBSTRING") {
                            if (globalThis.ISDEBUG) console.log("Executing CASEINSENSITIVE search");
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
                            let results: Package[] = (await dbo.collection(collection).find(query).toArray()) as any as Package[];
                            results.forEach(r => {
                                let found = false;
                                for (let i = 0; i < allresults.length; i++) {
                                    if (r._id.toString() === allresults[i]._id.toString()) {
                                        found = true;
                                    }
                                }
                                if (!found) {
                                    allresults.push(r);
                                }
                            });
                            //allresults = allresults.concat(results);
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

    MongoGetManifest(collection: string = 'packages', KeyWord: string = '', MatchType: string = 'Substring', options: any): Promise<Package[]> {
        if (globalThis.ISDEBUG) console.log(collection);
        if (globalThis.ISDEBUG) console.log(KeyWord);
        if (globalThis.ISDEBUG) console.log(MatchType);
        if (globalThis.ISDEBUG) console.log(options);

        let query: any = { PackageIdentifier: KeyWord }
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
                            if (globalThis.ISDEBUG) console.log(JSON.stringify(SubstringQuery));
                            let _collection = await dbo.collection(collection);
                            //let idxs = await _collection.indexes();
                            let results: Package[] = await dbo.collection(collection).find(SubstringQuery).toArray() as any as Package[];
                            db.close();
                            if (globalThis.ISDEBUG) console.log("MongoGetManifest");
                            if (globalThis.ISDEBUG) console.log(results);
                            resolve(results);
                        }
                        catch (err) {
                            if (globalThis.ISDEBUG) console.log(err);
                            reject(err);
                        }
                    }
                    else {
                        let results: Package[] = await dbo.collection(collection).find(query).toArray() as any as Package[];
                        if (globalThis.ISDEBUG) console.log(JSON.stringify(query));
                        if (globalThis.ISDEBUG) console.log("MongoGetManifest");
                        if (globalThis.ISDEBUG) console.log(results);
                        db.close();
                        resolve(results);
                    }
                }).catch(
                    err => {
                        if (globalThis.ISDEBUG) console.log("COULD NOT CONNECT TO MONGO");
                        if (globalThis.ISDEBUG) console.log(err);
                        reject(err);
                    }
                ).finally(
                    () => { }
                );
        });
    }

    /**
     * 
     * @param collection 
     * Should currently be "packages"
     * @param document 
     * This is a Package
     * @returns 
     */
    MongoInsertDocument(collection: string = 'packages', document: Package): Promise<Mongo.BSON.ObjectId> {
        return new Promise((resolve, reject) => {
            this.mongoclient.connect().then(
                async (db) => {
                    try {
                        var dbo = db.db("winget");
                        let packages = await dbo.collection(collection);

                        let okToInsert = false;

                        try {
                            let existingrecords = await dbo.collection(collection).find({ PackageIdentifier: { $eq: document.PackageIdentifier } }).toArray();
                            console.log(existingrecords);
                            let existinghash = await dbo.collection(collection).find({ 'Installers.InstallerSha256': new RegExp(`^${document.Installers[0].InstallerSha256}$`, "i") }).toArray();
                            console.log(existinghash);

                            // Capture and reject all errors found so end user knows everything that will cause failure.
                            let errstring = '';
                            if (existinghash.length > 0) {
                                errstring += "An installer with the same SHA256 hash already exist.\n";
                                //reject("An installer with the same SHA256 hash already exist. ");
                            }
                            if (existingrecords.length > 0) {
                                errstring += "An item with the same PackageIdentifier already exists.\n";
                                //reject("An item with the same PackageIdentifier already exists.");
                            }
                            if(errstring.length > 0) {
                                reject(errstring);
                            }
                            else {
                                okToInsert = true;
                            }
                        } catch (error) {
                            console.log(error);
                            reject("There was a problem checking for an existing records.");
                        }

                        if (okToInsert) {
                            let pkg = await packages.insertOne(document as any);
                            resolve(pkg.insertedId);
                        }
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
