const fs = require('fs');
const path = require('path');
const FileParser = require('./FileParser');

class Project {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.files = new Map();
    this.dependencies = new Map();
  }

  loadFile(filePath) {
    const absolutePath = path.resolve(this.rootDir, filePath);
    if (this.files.has(absolutePath)) {
      return this.files.get(absolutePath);
    }

    const code = fs.readFileSync(absolutePath, 'utf-8');
    const parser = new FileParser(code, absolutePath);
    parser.parse();
    this.files.set(absolutePath, parser);

    // Parse imports and load dependencies
    parser.getImports().forEach(importNode => {
      const importPath = path.resolve(path.dirname(absolutePath), importNode.source);
      this.loadFile(importPath);
    });

    return parser;
  }

  analyzeDependencies() {
    this.files.forEach((file, filePath) => {
      this.analyzeFileDependencies(file, filePath);
    });
  }

  analyzeFileDependencies(file, filePath) {
    const analyzeNode = (node) => {
      const deps = this.findNodeDependencies(node, file);
      this.dependencies.set(node, deps);
    };

    file.getInternalClasses().forEach(analyzeNode);
    file.getExportedClasses().forEach(analyzeNode);
    file.getInternalFunctions().forEach(analyzeNode);
    file.getExportedFunctions().forEach(analyzeNode);
  }

  findNodeDependencies(node, file) {
    const deps = new Set();
    const code = node.getSourceCode();
    
    file.getImports().forEach(importNode => {
      importNode.specifiers.forEach(spec => {
        if (code.includes(spec.local)) {
          const importedFile = this.files.get(path.resolve(path.dirname(file.filePath), importNode.source));
          if (importedFile) {
            if (spec.type === 'default') {
              deps.add(importedFile.getExportedClasses()[0] || importedFile.getExportedFunctions()[0]);
            } else if (spec.type === 'named') {
              const exportedItem = 
                importedFile.getExportedClasses().find(c => c.getName() === spec.imported) ||
                importedFile.getExportedFunctions().find(f => f.getName() === spec.imported) ||
                importedFile.getExportedVariables().find(v => v.getName() === spec.imported);
              if (exportedItem) deps.add(exportedItem);
            }
          }
        }
      });
    });

    return deps;
  }

  getNodeWithDependencies(node) {
    const deps = this.dependencies.get(node) || new Set();
    const nodeCode = node.getSourceCode();
    const depCodes = Array.from(deps).map(dep => dep.getSourceCode());
    return [nodeCode, ...depCodes].join('\n\n');
  }
}

module.exports = Project;