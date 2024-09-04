import fs from 'fs';
import path from 'path';
import os from 'os';
import { libp2pKit } from 'libp2p_kit_js';
import { ipfsKitJs } from 'ipfs_kit_js';
import { orbitDbKitJs } from 'orbitdb_kit_js';
import { ipfsModelManagerJs } from 'ipfs_model_manager_js';
import { ipfsDatasetsJs } from 'ipfs_datasets_js';
import { ipfsTransformersJs } from 'ipfs_transformers_js';
import { ipfsAgentsJs } from 'ipfs_agents_js';
import { ipfsFaissJs } from 'ipfs_faiss_js';
import { ipfsAccelerateJs } from 'ipfs_accelerate_js';

import { test_libp2p_kit_js } from 'libp2p_kit_js';
import { test_ipfs_kit_js } from 'ipfs_kit_js';
import { test_orbitdb_kit_js } from 'orbitdb_kit_js';
import { test_ipfs_model_manager_js } from 'ipfs_model_manager_js';
import { test_ipfs_datasets_js } from 'ipfs_datasets_js';
import { test_ipfs_transformers_js } from 'ipfs_transformers_js';
import { test_ipfs_agents_js } from 'ipfs_agents_js';
import { test_ipfs_faiss_js } from 'ipfs_faiss_js';
import { test_ipfs_accelerate_js } from 'ipfs_accelerate_js';



export class test_all {
    constructor(resources = {}, metadata = {}) {
        this.libp2pKit = new libp2pKit();
        this.ipfsKit = new ipfsKitJs();
        this.orbitdbKit = new orbitDbKitJs();
        this.ipfsModelManager = new ipfsModelManagerJs();
        this.ipfsDatasets = new ipfsDatasetsJs();
        this.ipfsTransformers = new ipfsTransformersJs();
        this.ipfsAgents = new ipfsAgentsJs();
        this.ipfsFaiss = new ipfsFaissJs();
        this.ipfsAccelerate = new ipfsAccelerateJs();
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
        let init_test = {};

        try {
            this.test_ipfs_accelerate_js = new test_ipfs_accelerate_js();
            init_test.test_ipfs_accelerate_js = await this.test_ipfs_accelerate_js.init();
            }
        catch (error) {
            init_test.test_ipfs_accelerate_js = error;
        }

        try {
            this.test_ipfs_faiss_js = new test_ipfs_faiss_js();
            init_test.test_ipfs_faiss_js = await this.test_ipfs_faiss_js.init();
        }
        catch (error) {
            init_test.test_ipfs_faiss_js = error;
        }

        try {
            this.test_ipfs_agents_js = new test_ipfs_agents_js();
            init_test.test_ipfs_agents_js = await this.test_ipfs_agents_js.init();
        }
        catch (error) {
            init_test.test_ipfs_agents_js = error;
        }

        try {
            this.test_ipfs_transformers_js = new test_ipfs_transformers_js();
            init_test.test_ipfs_transformers_js = await this.test_ipfs_transformers_js.init();
        }
        catch (error) {
            init_test.test_ipfs_transformers_js = error;
        }

        try {
            this.test_ipfs_datasets_js = new test_ipfs_datasets_js();
            init_test.test_ipfs_datasets_js = await this.test_ipfs_datasets_js.init();
        }
        catch (error) {
            init_test.test_ipfs_datasets_js = error;
        }

        try {
            this.test_ipfs_model_manager_js = new test_ipfs_model_manager_js();
            init_test.test_ipfs_model_manager_js = await this.test_ipfs_model_manager_js.init();
        }
        catch (error) {
            init_test.test_ipfs_model_manager_js = error;
        }
       
        try {
            this.test_orbitdb_kit_js = new test_orbitdb_kit_js();
            init_test.test_orbitdb_kit_js = await this.test_orbitdb_kit_js.init();
        }
        catch (error) {
            init_test.test_orbitdb_kit_js = error;
        }

        try {
            this.test_ipfs_kit_js = new test_ipfs_kit_js();
            init_test.test_ipfs_kit_js = await this.test_ipfs_kit_js.init();
        }
        catch (error) {
            init_test.test_ipfs_kit_js = error;
        }

        try {
            this.test_libp2p_kit_js = new test_libp2p_kit_js();
            init_test.test_libp2p_kit_js  = await this.test_libp2p_kit_js.init();
        }
        catch (error) {
            init_test.test_libp2p_kit_js = error;
        }

        let test_results = {};
        try {
            test_results.libp2pKit = await this.test_libp2p_kit_js.test();
        }
        catch (error) {
            test_results.libp2pKit = error;
        }
        try {
            test_results.ipfsKit = await this.test_ipfs_kit_js.test();
        }
        catch (error) {
            test_results.ipfsKit = error;
        }
        try {
            test_results.orbitdbKit = await this.test_orbitdb_kit_js.test();
        }
        catch (error) {
            test_results.orbitdbKit = error;
        }
        try {
            test_results.ipfsModelManager = await this.test_ipfs_model_manager_js.test();
        }
        catch (error) {
            test_results.ipfsModelManager = error;
        }
        try {
            test_results.ipfsDatasets = await this.test_ipfs_datasets_js.test();
        }
        catch (error) {
            test_results.ipfsDatasets = error;
        }
        try {
            test_results.ipfsTransformers = await this.test_ipfs_transformers_js.test();
        }
        catch (error) {
            test_results.ipfsTransformers = error;
        }
        try {
            test_results.ipfsAgents = await this.test_ipfs_agents_js.test();
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
