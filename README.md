# OnePlay Cloud Gaming Dashboard

A dashboard for the OnePlay cloud gaming service, providing users with access to their gaming library, statistics, and account management.

## Features

- User authentication system
- Collapsible sidebar navigation
- Games library management
- Gaming statistics and analytics
- Subscription management

## Quick Start

```bash
# Install dependencies
npm install

# Start the static server with live reload
npm run static

# OR start the full server with API support
npm run dev
```

Dashboard will be available at:
- Static mode: http://localhost:8080
- Full server mode: http://localhost:3000

## Login Credentials

- Username: admin
- Password: admin123

## Project Structure

```
oneplay_cloud_dashboard/
├── css/             # Stylesheets
├── js/              # Client-side JavaScript
├── assets/          # Images and other static files
├── pages/           # Dashboard pages
├── server/          # Server-side code and user management
│   └── users.json   # User credentials storage
├── index.html       # Login page
├── DEPLOYMENT.md    # Detailed deployment instructions
└── package.json     # Project configuration
```

## Making Changes

Just edit the HTML, CSS, or JavaScript files and the page will automatically reload when in development mode.

## Managing Users

```bash
# Add a user
npm run add-user username password

# Remove a user
npm run remove-user username

# List all users
npm run list-users
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on how to deploy to production environments.

## Additional Resources

Run the following to verify authentication is properly configured:
```bash
npm run check
```