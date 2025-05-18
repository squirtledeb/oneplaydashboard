const { spawn } = require('child_process');
const path = require('path');

// Start the bot
const bot = spawn('node', [path.join(__dirname, 'backend', 'bot.js')], {
  stdio: 'inherit'
});

// Start the dashboard server
// Serve dashboard on fixed port 5000 to avoid fallback messages
// Serve dashboard on fixed port 5500 to avoid fallback messages
const dashboard = spawn('npx', ['serve', '-s', path.join(__dirname, 'frontend'), '-l', '5500', '--no-port-switching'], {
  stdio: 'inherit'
});

// Note: The actual dashboard port may vary if 5000 is in use.
console.log('✅ Bot and dashboard are now running!');
console.log('• Bot is running in background');
console.log('• Dashboard port is chosen automatically by the server. Check the terminal output above for the correct URL.');

// Handle process termination
process.on('SIGINT', () => {
  bot.kill();
  dashboard.kill();
  process.exit(0);
});
