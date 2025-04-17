const Node = require('./Node');

class VariableNode extends Node {
  constructor(node, code) {
    super(node, code);
    this.kind = node.kind;
    this.name = node.id.name;
    this.init = node.init ? this.code.slice(node.init.start, node.init.end) : null;
  }

  getKind() {
    return this.kind;
  }

  getInitializer() {
    return this.init;
  }
}

module.exports = VariableNode;