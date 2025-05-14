# OnePlay Cloud Dashboard Authentication System

This directory contains the authentication system for the OnePlay Cloud Dashboard.

## Setup

1. Make sure you have Node.js installed on your system
2. Run `npm install` in the project root directory
3. Start the server with `npm start`

## Managing Users

You can manage users through the command line scripts or by directly editing the `users.json` file.

### Using Command Line Scripts

#### Add a new user:
```
node server/add-user.js <username> <password>
```

Example:
```
node server/add-user.js john password123
```

#### Remove a user:
```
node server/remove-user.js <username>
```

Example:
```
node server/remove-user.js john
```

#### List all users:
```
node server/list-users.js
```

### Directly Editing the JSON File

You can also directly edit the `users.json` file. The file structure is simple:

```json
{
  "users": [
    {
      "username": "admin",
      "password": "admin123"
    },
    {
      "username": "user1",
      "password": "password123"
    }
  ]
}
```

## Security Note

This is a simple implementation for demonstration purposes. In a production environment, you should:

1. Use a proper database instead of a JSON file
2. Hash passwords (never store them as plain text)
3. Implement user sessions, JWT tokens, or similar mechanisms
4. Use HTTPS
5. Implement rate limiting and other security measures