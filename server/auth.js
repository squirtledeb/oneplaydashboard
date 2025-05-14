// Simple authentication module
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.json');

// Function to get all users
function getUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data).users;
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

// Function to verify credentials
function verifyCredentials(username, password) {
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password);
  return !!user;
}

// Function to add a new user (for developer use)
function addUser(username, password) {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const usersData = JSON.parse(data);
    
    // Check if username already exists
    const userExists = usersData.users.some(u => u.username === username);
    if (userExists) {
      return { success: false, message: 'Username already exists' };
    }
    
    // Add new user
    usersData.users.push({ username, password });
    
    // Save back to file
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
    return { success: true, message: 'User added successfully' };
  } catch (error) {
    console.error('Error adding user:', error);
    return { success: false, message: 'Error adding user' };
  }
}

// Function to remove a user (for developer use)
function removeUser(username) {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const usersData = JSON.parse(data);
    
    const initialLength = usersData.users.length;
    usersData.users = usersData.users.filter(u => u.username !== username);
    
    if (usersData.users.length === initialLength) {
      return { success: false, message: 'User not found' };
    }
    
    // Save back to file
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
    return { success: true, message: 'User removed successfully' };
  } catch (error) {
    console.error('Error removing user:', error);
    return { success: false, message: 'Error removing user' };
  }
}

module.exports = {
  verifyCredentials,
  addUser,
  removeUser,
  getUsers
};