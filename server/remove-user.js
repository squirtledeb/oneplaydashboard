#!/usr/bin/env node

const auth = require('./auth');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length !== 1) {
  console.log('Usage: node remove-user.js <username>');
  process.exit(1);
}

const [username] = args;

// Remove the user
const result = auth.removeUser(username);
console.log(result.message);

if (result.success) {
  console.log('Current users:');
  console.log(auth.getUsers());
}

process.exit(result.success ? 0 : 1);