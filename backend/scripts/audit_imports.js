const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.next' && file !== 'dist') {
          results = results.concat(getFiles(fullPath));
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
        results.push(fullPath);
      }
    });
  } catch (e) {}
  return results;
}

['frontend/src', 'backend'].forEach(rootDir => {
  const files = getFiles(rootDir);
  const imports = new Set();
  const importRegex = /(?:from\s+['"]([^'"]+)['"]|import\s*\(['"]([^'"]+)['"]\)|require\s*\(['"]([^'"]+)['"]\))/g;

  files.forEach(f => {
    const content = fs.readFileSync(f, 'utf8');
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const pkg = match[1] || match[2] || match[3];
      if (pkg && !pkg.startsWith('.') && !pkg.startsWith('@/')) {
        const rootPkg = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
        imports.add(rootPkg);
      }
    }
  });

  console.log(`\nAll 3rd party packages imported in ${rootDir}:`);
  console.log(Array.from(imports).sort());
});
