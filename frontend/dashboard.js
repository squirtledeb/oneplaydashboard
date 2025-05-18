// Complete dashboard.js file (stable, minimal, and functional)

// --- State Management ---
let isCollapsibleOpen = false;
let currentView = localStorage.getItem('currentView') || 'login';
let currentSidebarContent = localStorage.getItem('currentSidebarContent') || 'default';
let discordConnected = false;
let connectedServer = '';
let availableChannels = [];

// --- WebSocket for instant integration updates ---
let ws;
function setupWebSocket() {
  if (ws) ws.close();
  ws = new WebSocket('ws://localhost:4001');
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'GUILD_UPDATE') {
        if (data.guilds && data.guilds.length > 0) {
          discordConnected = true;
          connectedServer = data.guilds[0].name;
        } else {
          discordConnected = false;
          connectedServer = '';
        }
        renderView();
      }
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };
  ws.onclose = () => setTimeout(setupWebSocket, 2000);
}
setupWebSocket();

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  renderView();
  setInterval(() => {
    fetch('/api/guilds')
      .then(res => res.json())
      .then(guilds => {
        if (guilds && guilds.length > 0) {
          discordConnected = true;
          connectedServer = guilds[0].name;
        } else {
          discordConnected = false;
          connectedServer = '';
        }
        renderView();
      })
      .catch(() => {});
  }, 5000);
});

// --- Main Render Function ---
function renderView() {
  localStorage.setItem('currentView', currentView);
  localStorage.setItem('currentSidebarContent', currentSidebarContent);
  if (currentView === 'login') {
    renderLogin();
  } else {
    renderDashboard();
  }
}

// --- Login Page ---
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="flex items-center justify-center h-screen">
      <form class="bg-white p-8 rounded-lg shadow-md w-96" onsubmit="handleLogin(event)">
        <h2 class="text-2xl font-bold mb-6 text-center text-gray-700">Login</h2>
        <div class="mb-4">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="username">Username</label>
          <input class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" id="username" type="text" placeholder="Username">
        </div>
        <div class="mb-6">
          <label class="block text-gray-700 text-sm font-bold mb-2" for="password">Password</label>
          <input class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" id="password" type="password" placeholder="Password">
        </div>
        <div class="flex items-center justify-between">
          <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
            Sign In
          </button>
        </div>
      </form>
    </div>
  `;
}
function handleLogin(event) {
  event.preventDefault();
  currentView = 'dashboard';
  renderView();
}

// --- Dashboard Layout ---
function renderDashboard() {
  document.getElementById('app').innerHTML = `
    <div class="flex h-screen">
      <div class="bg-gray-800 text-white w-64 flex-shrink-0 h-full flex flex-col justify-between">
        <div>
          <div class="p-4">
            <h2 class="text-xl font-bold mb-6">Dashboard</h2>
            <nav>
              <ul>
                <li class="mb-2">
                  <a href="#" class="flex items-center px-4 py-3 rounded hover:bg-gray-700 transition duration-200" onclick="showTicketsOptions(event)">
                    <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path>
                    </svg>
                    Tickets
                  </a>
                </li>
                <li>
                  <a href="#" class="flex items-center px-4 py-3 rounded hover:bg-gray-700 transition duration-200" onclick="showSettingsOptions(event)">
                    <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                    Settings
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div class="p-4 mb-4">
          <button onclick="logout()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
            Logout
          </button>
        </div>
      </div>
      <div id="collapsibleSidebar" class="bg-gray-200 sidebar-transition flex-shrink-0" style="width: ${isCollapsibleOpen ? '250px' : '50px'}">
        <div class="p-3">
          <button onclick="toggleCollapsible()" class="w-full flex justify-center items-center p-2 rounded hover:bg-gray-300 transition duration-200">
            <span>${isCollapsibleOpen ? '⬅️' : '➡️'}</span>
          </button>
          <div class="mt-4 ${isCollapsibleOpen ? 'block' : 'hidden'}">
            <h3 class="text-lg font-semibold mb-3">Quick Options</h3>
            <ul id="sidebarOptions">
              ${getSidebarContent()}
            </ul>
          </div>
        </div>
      </div>
      <div class="flex-1 p-8 overflow-auto">
        <div class="bg-white rounded-lg shadow-md p-6">
          ${currentView === 'integrations' ? renderIntegrationsContent() :
            currentView === 'botSetup' ? renderBotSetup() :
            renderDashboardContent()}
        </div>
      </div>
    </div>
  `;
}

// --- Sidebar & Navigation ---
function toggleCollapsible() {
  isCollapsibleOpen = !isCollapsibleOpen;
  renderView();
}
function logout() {
  currentView = 'login';
  localStorage.setItem('currentView', 'login');
  renderView();
}
function showTicketsOptions(event) {
  event.preventDefault();
  currentSidebarContent = 'tickets';
  renderView();
}
function showSettingsOptions(event) {
  event.preventDefault();
  currentSidebarContent = 'settings';
  renderView();
}
function showIntegrations(event) {
  event.preventDefault();
  currentView = 'integrations';
  renderView();
}
function showBotSettings(event) {
  event.preventDefault();
  currentView = 'botSetup';
  renderView();
}
function goBackToDashboard() {
  currentView = 'dashboard';
  renderView();
}
function getSidebarContent() {
  if (currentSidebarContent === 'tickets') {
    return `
      <li><a href="#" onclick="showAllTickets(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">All Tickets</a></li>
      <li><a href="#" onclick="showOpenTickets(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Open Tickets</a></li>
      <li><a href="#" onclick="showClosedTickets(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Closed Tickets</a></li>
    `;
  } else if (currentSidebarContent === 'settings') {
    return `
      <li><a href="#" onclick="showIntegrations(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Integrations</a></li>
      <li><a href="#" onclick="showBotSettings(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Bot Settings</a></li>
    `;
  }
  return `<li class="text-gray-700">No quick options available.</li>`;
}

// --- Dashboard Content ---
function renderDashboardContent() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Welcome to your Dashboard</h1>
    <p class="mb-4 text-gray-600">This is your main dashboard area. Select an option from the sidebars to navigate.</p>
    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div class="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <h3 class="text-lg font-semibold mb-2 text-blue-800">Active Tickets</h3>
        <p class="text-3xl font-bold text-blue-600">12</p>
      </div>
      <div class="bg-green-50 p-6 rounded-lg border border-green-200">
        <h3 class="text-lg font-semibold mb-2 text-green-800">Resolved Today</h3>
        <p class="text-3xl font-bold text-green-600">5</p>
      </div>
      <div class="bg-purple-50 p-6 rounded-lg border border-purple-200">
        <h3 class="text-lg font-semibold mb-2 text-purple-800">New Messages</h3>
        <p class="text-3xl font-bold text-purple-600">3</p>
      </div>
    </div>
    <div class="mt-8">
      <h2 class="text-xl font-bold mb-4 text-gray-800">Recent Activity</h2>
      <div class="border rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr>
              <td class="px-6 py-4 whitespace-nowrap">Ticket #1234</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Resolved</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">2 hours ago</td>
            </tr>
            <tr>
              <td class="px-6 py-4 whitespace-nowrap">Ticket #1235</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">In Progress</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">5 hours ago</td>
            </tr>
            <tr>
              <td class="px-6 py-4 whitespace-nowrap">Ticket #1236</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Active</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">1 day ago</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// --- Integrations Content ---
function renderIntegrationsContent() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Integrations</h1>
    <p class="mb-6 text-gray-600">Connect your dashboard with external services and platforms.</p>
    <div class="mt-6 border rounded-lg p-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <svg class="w-10 h-10 mr-4 text-indigo-600" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
          <div>
            <h3 class="text-lg font-semibold">Discord</h3>
            <p class="text-sm text-gray-600">Connect your Discord server to receive notifications and manage support tickets.</p>
          </div>
        </div>
        <div>
          ${discordConnected 
            ? `<button onclick="disconnectDiscord()" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition">Disconnect</button>`
            : `<button onclick="connectDiscord()" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition">Connect</button>`
          }
        </div>
      </div>
      ${discordConnected && connectedServer 
        ? `<div class="mt-3 p-3 bg-gray-50 rounded-lg">
             <div class="text-sm text-gray-700">Connected to server: <span class="font-semibold">${connectedServer}</span></div>
           </div>`
        : ''
      }
    </div>
    <div class="mt-6 text-right">
      <button onclick="goBackToDashboard()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
        Back to Dashboard
      </button>
    </div>
  `;
}
function connectDiscord() {
  window.open('https://discord.com/oauth2/authorize?client_id=1372610090888069190&permissions=8&scope=bot', '_blank');
}
function disconnectDiscord() {
  discordConnected = false;
  connectedServer = '';
  availableChannels = [];
  renderView();
}

// --- Bot Setup Content ---
function renderBotSetup() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Bot Setup</h1>
    <p class="mb-6 text-gray-600">Configure how the bot will handle tickets in your Discord server.</p>
    ${!discordConnected ? 
      `<div class="p-6 bg-yellow-50 rounded-lg border border-yellow-200 mb-6">
        <p class="text-yellow-700">Please connect your Discord server first in the Integrations section.</p>
      </div>` :
      `<div class="border rounded-lg p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">Channel Configuration</h2>
        <div class="mb-4">
          <label for="channelSelect" class="block text-sm font-medium text-gray-700 mb-2">Select Channel for Ticket Messages</label>
          <select id="channelSelect" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">-- Select a channel --</option>
            ${availableChannels.map(channel => 
              `<option value="${channel.id}">${channel.name}</option>`
            ).join('')}
          </select>
        </div>
        <h3 class="text-lg font-medium mb-3 mt-6">Embedded Message Settings</h3>
        <div class="grid grid-cols-1 gap-4">
          <div>
            <label for="embedTitle" class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" id="embedTitle" value="Support Ticket System" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
          </div>
          <div>
            <label for="embedDescription" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea id="embedDescription" rows="3" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">Click the button below to create a new support ticket.</textarea>
          </div>
          <div>
            <label for="buttonLabel" class="block text-sm font-medium text-gray-700 mb-1">Button Title</label>
            <input type="text" id="buttonLabel" value="Create Ticket" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
          </div>
          <div>
            <label for="embedColor" class="block text-sm font-medium text-gray-700 mb-1">Embed Color</label>
            <input type="color" id="embedColor" value="#5865F2" class="w-full h-10 border border-gray-300 rounded-md shadow-sm p-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
          </div>
        </div>
        <div class="mt-6 flex justify-between">
          <button onclick="previewEmbed()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
            Preview Embed
          </button>
          <button onclick="deployEmbed()" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition">
            Deploy to Discord
          </button>
        </div>
        <div id="embedPreview" class="mt-6 hidden"></div>
      </div>`
    }
    <div class="mt-6 text-right">
      <button onclick="goBackToDashboard()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
        Back to Dashboard
      </button>
    </div>
  `;
}
function previewEmbed() {
  const title = document.getElementById('embedTitle').value;
  const description = document.getElementById('embedDescription').value;
  const buttonLabel = document.getElementById('buttonLabel').value;
  const color = document.getElementById('embedColor').value;
  const previewContainer = document.getElementById('embedPreview');
  previewContainer.innerHTML = `
    <div class="p-4 border rounded-lg" style="border-left: 4px solid ${color}">
      <h3 class="text-lg font-bold">${title}</h3>
      <p>${description}</p>
      <button class="mt-2 px-4 py-2 bg-blue-500 text-white rounded">${buttonLabel}</button>
    </div>
  `;
  previewContainer.classList.remove('hidden');
}
function deployEmbed() {
  const channelId = document.getElementById('channelSelect').value;
  const title = document.getElementById('embedTitle').value;
  const description = document.getElementById('embedDescription').value;
  const buttonLabel = document.getElementById('buttonLabel').value;
  const color = document.getElementById('embedColor').value;
  if (!channelId) {
    alert('Please select a channel.');
    return;
  }
  fetch('/api/deploy-embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, title, description, buttonLabel, color })
  })
    .then(res => res.json())
    .then(response => {
      if (response.success) {
        alert('Embed deployed successfully!');
      } else {
        alert('Failed to deploy embed.');
      }
    })
    .catch(() => {
      alert('An error occurred while deploying the embed.');
    });
}

// --- Tickets Sidebar Option Handlers (placeholders) ---
function showAllTickets(event) { event.preventDefault(); alert('Show all tickets (not implemented)'); }
function showOpenTickets(event) { event.preventDefault(); alert('Show open tickets (not implemented)'); }
function showClosedTickets(event) { event.preventDefault(); alert('Show closed tickets (not implemented)'); }