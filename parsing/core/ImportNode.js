const Node = require('./Node');

class ImportNode extends Node {
  constructor(node, code) {
    super(node, code);
    this.type = node.type;
    this.source = node.source.value;
    this.specifiers = this.parseSpecifiers(node.specifiers);
  }

  parseSpecifiers(specifiers) {
    return specifiers.map(specifier => {
      if (specifier.type === 'ImportDefaultSpecifier') {
        return { type: 'default', local: specifier.local.name };
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        return { type: 'namespace', local: specifier.local.name };
      } else if (specifier.type === 'ImportSpecifier') {
        return { 
          type: 'named', 
          local: specifier.local.name, 
          imported: specifier.imported.name 
        };
      }
    });
  }

  isWholeModuleImported() {
    return this.specifiers.length === 0 || 
           (this.specifiers.length === 1 && this.specifiers[0].type === 'namespace');
  }

  getImportedNames() {
    return this.specifiers.map(spec => spec.local);
  }
}

module.exports = ImportNode;