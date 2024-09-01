
class IpfsAgentCjs {
    constructor() {
        this.module = {};
    }

    init() {
        this.sayHello = this.sayHello.bind(this);
    }

    sayHello() {
        console.log("Hello from IpfsAgentCjs");
    }
}


// Define your module code here
function init() {
    console.log("Initializing module");
    module.exports = {
        IpfsAgentCjs: IpfsAgentCjs
    }

}

// Make the sayHello function available to other modules
module = {
    init: init
};


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
