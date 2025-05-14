#!/usr/bin/env node

const auth = require('./auth');

// List all users
const users = auth.getUsers();
console.log('Current users:');
console.log(JSON.stringify(users, null, 2));

process.exit(0);