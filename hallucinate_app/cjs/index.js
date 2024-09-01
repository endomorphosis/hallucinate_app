
function init() {
    console.log("Initializing module");
    module.exports = {
        IpfsAgentCjs: IpfsAgentCjs
    }

}

module = {
    init: init
};

const require = function (path) {
    return module.exports;
}


class IpfsAgentCjs {
    constructor() {
        this.module = {};
        this.newModule = {};
    }

    init() {
        this.sayHello = this.sayHello.bind(this);
    }

    test() {
        console.log("Test");
        // Use the imported module here
        // For example: otherModule.someFunction();
    }
    sayHello() {
        console.log("Hello from IpfsAgentCjs");
        console.log(Object.keys(this));
    }
}


module.run = function() {
    console.log("Running module");
    module.init();
    module.exports.IpfsAgentCjs = new IpfsAgentCjs();
    module.exports.IpfsAgentCjs.init();
    console.log("IpfsAgentCjs initialized");
    module.exports.IpfsAgentCjs.sayHello();
}

module.run();

module.exports;

const { libp2pKit } = require("./libp2p_kit_cjs/libp2p_kit.cjs");
const otherModule = require("./path/to/otherModule");

