/**
 * Replace console.error with logger.error
 * Systematically replaces all console.error calls with proper Winston logging
 */

const fs = require('fs');
const path = require('path');

const controllersPath = path.join(__dirname, 'controllers');
const excludeFiles = ['developerController.js'];

function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllJsFiles(filePath, fileList);
    } else if (file.endsWith('.js') && !excludeFiles.includes(file)) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function replaceConsoleErrors(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let replacements = 0;
  
  // Pattern 1: console.error('message', error)
  const pattern1 = /console\.error\(\s*(['"`])([^'"`]+)\1\s*,\s*(\w+)\s*\)/g;
  content = content.replace(pattern1, (match, quote, message, errorVar) => {
    replacements++;
    modified = true;
    return `logger.error('${message}', {\n      error: ${errorVar}.message,\n      requestId: req.requestId,\n      tenantId: req.tenant?.tenant_id\n    })`;
  });
  
  // Pattern 2: console.error('message:', error)
  const pattern2 = /console\.error\(\s*(['"`])([^'"`]+):\s*\1\s*,\s*(\w+)\s*\)/g;
  content = content.replace(pattern2, (match, quote, message, errorVar) => {
    replacements++;
    modified = true;
    return `logger.error('${message}', {\n      error: ${errorVar}.message,\n      requestId: req.requestId,\n      tenantId: req.tenant?.tenant_id\n    })`;
  });
  
  // Pattern 3: console.error("message")
  const pattern3 = /console\.error\(\s*(['"`])([^'"`]+)\1\s*\)/g;
  content = content.replace(pattern3, (match, quote, message) => {
    replacements++;
    modified = true;
    return `logger.error('${message}', {\n      requestId: req.requestId,\n      tenantId: req.tenant?.tenant_id\n    })`;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
  
  return { modified, replacements };
}

const files = getAllJsFiles(controllersPath);
let totalFiles = 0;
let modifiedFiles = 0;
let totalReplacements = 0;

console.log('Starting console.error replacement...\n');

files.forEach(file => {
  totalFiles++;
  const result = replaceConsoleErrors(file);
  
  if (result.modified) {
    modifiedFiles++;
    totalReplacements += result.replacements;
    console.log(`✓ ${path.basename(file)} - ${result.replacements} replacements`);
  }
});

console.log(`\n=== Summary ===`);
console.log(`Total files processed: ${totalFiles}`);
console.log(`Files modified: ${modifiedFiles}`);
console.log(`Total console.error replacements: ${totalReplacements}`);
