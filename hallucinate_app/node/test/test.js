import fs from 'fs';
import path from 'path';
import os from 'os';
import { libp2pKit } from 'libp2p_kit';
import { ipfsKit } from 'ipfs_kit';
import { orbitdbKit } from 'orbitdb_kit';
import { ipfsModelManager } from 'ipfs_model_manager';
import { ipfsDatasets } from 'ipfs_datasets';
import { ipfsTransformers } from 'ipfs_transformers';
import { ipfsAgents } from 'ipfs_agents';
import { ipfsFaiss } from 'ipfs_faiss';
import { ipfsAccelerate } from 'ipfs_accelerate';

export class test_all {
    constructor(resources = {}, metadata = {}) {
        this.libp2pKit = new libp2pKit();
        this.ipfsKit = new ipfsKit();
        this.orbitdbKit = new orbitdbKit();
        this.ipfsModelManager = new ipfsModelManager();
        this.ipfsDatasets = new ipfsDatasets();
        this.ipfsTransformers = new ipfsTransformers();
        this.ipfsAgents = new ipfsAgents();
        this.ipfsFaiss = new ipfsFaiss();
        this.ipfsAccelerate = new ipfsAccelerate();
        this.resources = resources;
        this.metadata = metadata;
    }


    async init() {
        let init_results = {};
        try {
            init_results.libp2pKit = await this.libp2pKit.init();
        }
        catch (error) {
            init_results.libp2pKit = error;
        }
        try {
            init_results.ipfsKit = await this.ipfsKit.init();
        }
        catch (error) {
            init_results.ipfsKit = error;
        }
        try {
            init_results.orbitdbKit = await this.orbitdbKit.init();
        }
        catch (error) {
            init_results.orbitdbKit = error;
        }
        try {
            init_results.ipfsModelManager = await this.ipfsModelManager.init();
        }
        catch (error) {
            init_results.ipfsModelManager = error;
        }
        try {
            init_results.ipfsDatasets = await this.ipfsDatasets.init();
        }
        catch (error) {
            init_results.ipfsDatasets = error;
        }
        try {
            init_results.ipfsTransformers = await this.ipfsTransformers.init();
        }
        catch (error) {
            init_results.ipfsTransformers = error;
        }
        try {
            init_results.ipfsAgents = await this.ipfsAgents.init();
        }
        catch (error) {
            init_results.ipfsAgents = error;
        }
        try {
            init_results.ipfsFaiss = await this.ipfsFaiss.init();
        }
        catch (error) {
            init_results.ipfsFaiss = error;
        }
        try {
            init_results.ipfsAccelerate = await this.ipfsAccelerate.init();
        }
        catch (error) {
            init_results.ipfsAccelerate = error;
        }
        return init_results;
    }

    async test() {
        let test_results = {};
        try {
            test_results.libp2pKit = await this.libp2pKit.test();
        }
        catch (error) {
            test_results.libp2pKit = error;
        }
        try {
            test_results.ipfsKit = await this.ipfsKit.test();
        }
        catch (error) {
            test_results.ipfsKit = error;
        }
        try {
            test_results.orbitdbKit = await this.orbitdbKit.test();
        }
        catch (error) {
            test_results.orbitdbKit = error;
        }
        try {
            test_results.ipfsModelManager = await this.ipfsModelManager.test();
        }
        catch (error) {
            test_results.ipfsModelManager = error;
        }
        try {
            test_results.ipfsDatasets = await this.ipfsDatasets.test();
        }
        catch (error) {
            test_results.ipfsDatasets = error;
        }
        try {
            test_results.ipfsTransformers = await this.ipfsTransformers.test();
        }
        catch (error) {
            test_results.ipfsTransformers = error;
        }
        try {
            test_results.ipfsAgents = await this.ipfsAgents.test();
        }
        catch (error) {
            test_results.ipfsAgents = error;
        }
        return test_results;
    }
}

export default test_all;

if (import.meta.url === 'file://' + process.argv[1]) {
    console.log("Running test");
    let test_results = {};
    try{
        const testIpfsAll = new test_all();
        await testIpfsAll.init().then((init) => {
            test_results.init = init;
            console.log("testIpfsAll init: ", init);
            testIpfsAll.test().then((result) => {
                test_results.results = result;
                console.log("testIpfsAll: ", result);
            }).catch((error) => {
                test_results.results = error;
                console.log("testIpfsAll error: ", error);
                // throw error;
            });
        }).catch((error) => {
            test_results.init = error ;
            console.error("testIpfsAll init error: ", error);
            // throw error;
            testIpfsAll.test().then((result) => {
                test_results.results = result;
                console.log("testIpfsAll: ", result);
            }).catch((error) => {
                test_results.results = error;
                console.log("testIpfsAll error: ", error);
                // throw error;
            });
        });
        console.log(test_results);
        fs.writeFileSync("./tests/test_results.json", JSON.stringify(test_results, null, 2));
        let testResultsFile = "./tests/README.md";
        let testResults = "";
        for (let key in test_results) {
            testResults += key + "\n";
            testResults += "```json\n";
            testResults += JSON.stringify(test_results[key], null, 2);
            testResults += "\n```\n";
        }
        fs.writeFileSync(testResultsFile, testResults);
        if (Object.keys(test_results).includes("test_results") === false) {
            process.exit(0);
        }
        else{
            process.exit(1);
        }   
    }
    catch(err){
        console.log(err);
        // process.exit(1);
    }   
}
