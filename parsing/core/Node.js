class Node {
  constructor(node, code) {
    this.node = node;
    this.start = node.start;
    this.end = node.end;
    this.code = code.substring(this.start, this.end);
    // console.log("New node created", this.getName(), this.code);
  }

  getSourceCode() {
    return this.code.slice(this.node.start, this.node.end);
  }

  getName() {
    return this.node.id ? this.node.id.name : null;
  }
}

module.exports = Node;