#!/usr/bin/env node

const auth = require('./auth');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.log('Usage: node add-user.js <username> <password>');
  process.exit(1);
}

const [username, password] = args;

// Add the user
const result = auth.addUser(username, password);
console.log(result.message);

if (result.success) {
  console.log('Current users:');
  console.log(auth.getUsers());
}

process.exit(result.success ? 0 : 1);