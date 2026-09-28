const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const reactDir = path.join(rootDir, 'react');
const reactDist = path.join(reactDir, 'dist');
const rootDist = path.join(rootDir, 'dist');

console.log('--- Starting Production Build ---');

// 1. Ensure react dependencies are installed
if (!fs.existsSync(path.join(reactDir, 'node_modules'))) {
  console.log('Installing dependencies in ./react ...');
  execSync('npm install', { cwd: reactDir, stdio: 'inherit' });
}

// 2. Build the Vite React project
console.log('Building Vite React project in ./react ...');
execSync('npm run build', { cwd: reactDir, stdio: 'inherit' });

// 3. Mirror react/dist to root/dist for hosts expecting root output (Vercel/Render/Netlify default)
if (fs.existsSync(reactDist)) {
  console.log(`Copying build output from ${reactDist} to ${rootDist} ...`);
  if (fs.existsSync(rootDist)) {
    fs.rmSync(rootDist, { recursive: true, force: true });
  }
  fs.cpSync(reactDist, rootDist, { recursive: true });
  console.log('Build output mirrored to root /dist successfully.');
}

console.log('--- Production Build Complete! ---');
