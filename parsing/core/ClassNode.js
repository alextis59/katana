const Node = require('./Node');

class ClassNode extends Node {
  constructor(node, code) {
    super(node, code);
    this.methods = [];
    this.properties = [];
    this.parseClassBody();
  }

  parseClassBody() {
    this.node.body.body.forEach(member => {
      if (member.type === 'MethodDefinition') {
        this.methods.push({
          name: member.key.name,
          kind: member.kind,
          static: member.static,
          code: this.code.slice(member.start, member.end)
        });
      } else if (member.type === 'PropertyDefinition') {
        this.properties.push({
          name: member.key.name,
          static: member.static,
          code: this.code.slice(member.start, member.end)
        });
      }
    });
  }

  getMethods() {
    return this.methods;
  }

  getProperties() {
    return this.properties;
  }
}

module.exports = ClassNode;