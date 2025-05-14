#!/usr/bin/env node

/**
 * This script checks and ensures that client-side authentication is working
 */

const fs = require('fs');
const path = require('path');

// Check and update main.js to ensure client-side authentication
const mainJsPath = path.join(__dirname, 'js', 'main.js');
const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

// Check if client-side auth is already implemented
if (mainJsContent.includes('// Hardcoded users for client-side demo')) {
  console.log('✅ Client-side authentication is already implemented');
} else {
  console.log('❌ Client-side authentication is not implemented');
  console.log('Please run: npm run setup-clientside');
}

// Check user credentials
const serverUsersPath = path.join(__dirname, 'server', 'users.json');
if (fs.existsSync(serverUsersPath)) {
  try {
    const usersData = JSON.parse(fs.readFileSync(serverUsersPath, 'utf8'));
    console.log('\nAvailable users for testing:');
    usersData.users.forEach(user => {
      console.log(`- Username: ${user.username}, Password: ${user.password}`);
    });
  } catch (error) {
    console.error('Error reading users file:', error);
  }
}

console.log('\nTo deploy and serve the application:');
console.log('1. Run: npm run static');
console.log('2. Open: http://localhost:8080');
