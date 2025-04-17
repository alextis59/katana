const Node = require('./Node');

class FunctionNode extends Node {
  constructor(node, code) {
    super(node, code);
    this.params = this.node.params.map(param => param.name);
  }

  getParams() {
    return this.params;
  }

  isAsync() {
    return this.node.async;
  }

  isGenerator() {
    return this.node.generator;
  }
}

module.exports = FunctionNode;