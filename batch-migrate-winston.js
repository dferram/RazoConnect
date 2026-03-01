/**
 * Batch Winston Migration Script
 * Systematically adds logger imports to all controllers that need it
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

function addLoggerImport(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if file has console.error
  if (!content.includes('console.error')) {
    return { modified: false, reason: 'no console.error' };
  }
  
  // Check if logger is already imported
  if (content.match(/require\(['"]\.\.(\/\.\.)*\/utils\/logger['"]\)/)) {
    return { modified: false, reason: 'logger already imported' };
  }
  
  // Find the first require statement
  const requireMatch = content.match(/(const .+ = require\(.+\);)/);
  if (!requireMatch) {
    return { modified: false, reason: 'no require statements found' };
  }
  
  const firstRequire = requireMatch[1];
  const depth = (filePath.match(/controllers/g) || []).length + (filePath.match(/\\/g) || []).length - (controllersPath.match(/\\/g) || []).length - 1;
  const relativePath = '../'.repeat(Math.max(1, depth)) + 'utils/logger';
  
  const newContent = content.replace(
    firstRequire,
    `${firstRequire}\nconst logger = require('${relativePath}');`
  );
  
  fs.writeFileSync(filePath, newContent, 'utf8');
  return { modified: true, reason: 'logger import added' };
}

const files = getAllJsFiles(controllersPath);
let totalFiles = 0;
let modifiedFiles = 0;
let skippedFiles = 0;

console.log('Starting Winston migration...\n');

files.forEach(file => {
  totalFiles++;
  const result = addLoggerImport(file);
  
  if (result.modified) {
    modifiedFiles++;
    console.log(`✓ ${path.basename(file)} - ${result.reason}`);
  } else {
    skippedFiles++;
    if (result.reason === 'no console.error') {
      // Silent skip
    } else {
      console.log(`- ${path.basename(file)} - ${result.reason}`);
    }
  }
});

console.log(`\n=== Summary ===`);
console.log(`Total files processed: ${totalFiles}`);
console.log(`Files modified: ${modifiedFiles}`);
console.log(`Files skipped: ${skippedFiles}`);
console.log(`\nNext step: Replace console.error with logger.error in each file`);
