// =====================
// DASHBOARD.JS (FULL VERSION, FIXED DEPLOY EMBED PAYLOAD STRUCTURE)
// =====================

 
// --- CONFIGURATION ---
const API_BASE = 'http://localhost:4000';

// --- STATE MANAGEMENT ---
let isCollapsibleOpen = false;
let currentView = localStorage.getItem('currentView') || 'login';
let currentSidebarContent = localStorage.getItem('currentSidebarContent') || 'tickets';
let discordConnected = false;
let connectedServer = '';
let connectedGuildId = '';
let availableChannels = [];
let availableCategories = [];
let selectedCategoryId = localStorage.getItem('selectedCategoryId') || '';
let selectedChannelId = localStorage.getItem('selectedChannelId') || '';
let embedTitle = localStorage.getItem('embedTitle') || 'Support Ticket System';
let embedDescription = localStorage.getItem('embedDescription') || 'Click the button below to create a new support ticket.';
let embedButtonLabel = localStorage.getItem('embedButtonLabel') || 'Create Ticket';
let embedColor = localStorage.getItem('embedColor') || '#5865F2';
let tickets = [];
let ticketDashboardStats = { active: 0, resolvedToday: 0, newMessages: 0 };
let ticketActivity = [];
let currentTicketLiveView = null; // New state: currently viewed ticket in live view
let ticketMessages = {}; // Store messages per ticket for live view


function disconnectDiscord() {
  manualDisconnect = true;
  discordConnected = false;
  connectedServer = '';
  connectedGuildId = '';
  availableChannels = [];
  tickets = [];
  embedTitle = 'Support Ticket System';
  embedDescription = 'Click the button below to create a new support ticket.';
  embedButtonLabel = 'Create Ticket';
  embedColor = '#5865F2';
  selectedChannelId = '';
  localStorage.removeItem('embedTitle');
  localStorage.removeItem('embedDescription');
  localStorage.removeItem('embedButtonLabel');
  localStorage.removeItem('embedColor');
  localStorage.removeItem('selectedChannelId');
  if (ws) {
    ws.close();
    ws = null;
  }
  stopPolling();
  renderView();
}

// --- HANDLER FUNCTIONS ---
function toggleCollapsible() {
  isCollapsibleOpen = !isCollapsibleOpen;
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
function showTicketDashboard(event) {
  event.preventDefault();
  currentView = 'ticketDashboard';
  renderView();
}
function showAllTickets(event) {
  event.preventDefault();
  currentView = 'allTickets';
  renderView();
}
function showOpenTickets(event) {
  event.preventDefault();
  currentView = 'openTickets';
  renderView();
}
function showClosedTickets(event) {
  event.preventDefault();
  currentView = 'closedTickets';
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
function logout() {
  currentView = 'login';
  localStorage.setItem('currentView', 'login');
  renderView();
}
function onChannelSelectChange(select) {
  selectedChannelId = select.value;
  localStorage.setItem('selectedChannelId', selectedChannelId);
}
function onCategorySelectChange(select) {
  selectedCategoryId = select.value;
  localStorage.setItem('selectedCategoryId', selectedCategoryId);
}
function onEmbedInputChange() {
  embedTitle = document.getElementById('embedTitle').value;
  embedDescription = document.getElementById('embedDescription').value;
  embedButtonLabel = document.getElementById('buttonLabel').value;
  embedColor = document.getElementById('embedColor').value;
  localStorage.setItem('embedTitle', embedTitle);
  localStorage.setItem('embedDescription', embedDescription);
  localStorage.setItem('embedButtonLabel', embedButtonLabel);
  localStorage.setItem('embedColor', embedColor);
}
function previewEmbed() {
  onEmbedInputChange();
  const previewContainer = document.getElementById('embedPreview');
  previewContainer.innerHTML = `
    <div class="p-4 border rounded-lg" style="border-left: 4px solid ${embedColor}">
      <h3 class="text-lg font-bold">${embedTitle}</h3>
      <p>${embedDescription}</p>
      <button class="mt-2 px-4 py-2 bg-blue-500 text-white rounded">${embedButtonLabel}</button>
    </div>
  `;
  previewContainer.classList.remove('hidden');
}
function deployEmbed() {
  // Validate
  if (!selectedChannelId) {
    showDeployMessage('Please select a channel before deploying.', false);
    return;
  }
  // Validate category selection is optional, so no error if empty
  if (!embedTitle || !embedDescription || !embedButtonLabel || !embedColor) {
    showDeployMessage('Please fill in all embed fields.', false);
    return;
  }
  // Prepare payload (FLATTENED, NOT NESTED)
  const payload = {
    channelId: selectedChannelId,
    title: embedTitle,
    description: embedDescription,
    buttonLabel: embedButtonLabel,
    color: embedColor,
    parentCategoryId: selectedCategoryId || null
  };
  fetch(`${API_BASE}/api/deploy-embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        showDeployMessage('Embed deployed to Discord successfully!', true);
      } else {
        showDeployMessage(data && data.error ? data.error : 'Failed to deploy embed.', false);
      }
    })
    .catch(err => {
      showDeployMessage('Failed to deploy embed: ' + err.message, false);
    });
}
function showDeployMessage(msg, success) {
  let msgDiv = document.getElementById('deployEmbedMsg');
  if (!msgDiv) {
    msgDiv = document.createElement('div');
    msgDiv.id = 'deployEmbedMsg';
    document.getElementById('embedPreview').parentNode.insertBefore(msgDiv, document.getElementById('embedPreview'));
  }
  msgDiv.innerHTML = `<div class="mb-4 p-3 rounded ${success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${msg}</div>`;
  msgDiv.style.display = 'block';
  setTimeout(() => { msgDiv.style.display = 'none'; }, 4000);
}

// --- RENDERING FUNCTIONS ---
function renderDashboardContent() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Welcome to your Dashboard</h1>
    <p class="mb-4 text-gray-600">This is your main dashboard area. Select an option from the sidebars to navigate.</p>
    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div class="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <h3 class="text-lg font-semibold mb-2 text-blue-800">Active Tickets</h3>
        <p class="text-3xl font-bold text-blue-600">${ticketDashboardStats.active}</p>
      </div>
      <div class="bg-green-50 p-6 rounded-lg border border-green-200">
        <h3 class="text-lg font-semibold mb-2 text-green-800">Resolved Today</h3>
        <p class="text-3xl font-bold text-green-600">${ticketDashboardStats.resolvedToday}</p>
      </div>
      <div class="bg-purple-50 p-6 rounded-lg border border-purple-200">
        <h3 class="text-lg font-semibold mb-2 text-purple-800">New Messages</h3>
        <p class="text-3xl font-bold text-purple-600">${ticketDashboardStats.newMessages}</p>
      </div>
    </div>
    <div class="mt-8">
      <h2 class="text-xl font-bold mb-4 text-gray-800">Recent Ticket Activity</h2>
      <div class="border rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${ticketActivity.map(t => `
              <tr>
                <td class="px-6 py-4 whitespace-nowrap">#${t.ticketNumber}</td>
                <td class="px-6 py-4 whitespace-nowrap">${t.username || 'Unknown'}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${t.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${t.status === 'active' ? 'Active' : 'Resolved'}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
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
            : `<button onclick="window.open('https://discord.com/oauth2/authorize?client_id=1372610090888069190&permissions=8&integration_type=0&scope=bot', '_blank')" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition">Connect</button>`
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
function renderSettingsDashboardContent() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Settings</h1>
    <p class="mb-4 text-gray-600">Select a quick option from the sidebar to configure integrations or bot setup.</p>
  `;
}
function renderClosedTicketsContent() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Resolved Tickets</h1>
    <div class="border rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${tickets.filter(t => t.status === 'closed').map(t => `
            <tr onclick="window.openTicketLiveView(${t.ticketNumber})" style="cursor:pointer;">
              <td class="px-6 py-4 whitespace-nowrap">#${t.ticketNumber}</td>
              <td class="px-6 py-4 whitespace-nowrap">${t.username || 'Unknown'}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Resolved</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
function renderAllTicketsContent() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">All Tickets</h1>
    <div class="border rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${tickets.map(t => `
            <tr onclick="window.openTicketLiveView(${t.ticketNumber})" style="cursor:pointer;">
              <td class="px-6 py-4 whitespace-nowrap">#${t.ticketNumber}</td>
              <td class="px-6 py-4 whitespace-nowrap">${t.username || 'Unknown'}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${t.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${t.status === 'active' ? 'Active' : 'Resolved'}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
function renderOpenTicketsContent() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Active Tickets</h1>
    <div class="border rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${tickets.filter(t => t.status === 'active').map(t => `
            <tr onclick="window.openTicketLiveView(${t.ticketNumber})" style="cursor:pointer;">
              <td class="px-6 py-4 whitespace-nowrap">#${t.ticketNumber}</td>
              <td class="px-6 py-4 whitespace-nowrap">${t.username || 'Unknown'}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Active</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
function renderBotSetup() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Bot Setup</h1>
    <p class="mb-6 text-gray-600">Configure how the bot will handle tickets in your Discord server.</p>
    ${!discordConnected ? 
      `<div class="p-6 bg-yellow-50 rounded-lg border border-yellow-200 mb-6">
        <p class="text-yellow-700">Please connect your Discord server first in the Integrations section.</p>
      </div>` :
      `<div class="border rounded-lg p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">Category Configuration</h2>
        <div class="mb-4">
          <label for="categorySelect" class="block text-sm font-medium text-gray-700 mb-2">Select Category for Tickets</label>
          <select id="categorySelect" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" onchange="onCategorySelectChange(this)">
            <option value="">-- Select a category --</option>
            ${availableCategories.map(category => 
              `<option value="${category.id}"${category.id === selectedCategoryId ? ' selected' : ''}>${category.name}</option>`
            ).join('')}
          </select>
        </div>
        <h2 class="text-xl font-semibold mb-4 mt-6">Channel Configuration</h2>
        <div class="mb-4">
          <label for="channelSelect" class="block text-sm font-medium text-gray-700 mb-2">Select Channel for Ticket Messages</label>
          <select id="channelSelect" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" onchange="onChannelSelectChange(this)">
            <option value="">-- Select a channel --</option>
            ${availableChannels.map(channel => 
              `<option value="${channel.id}"${channel.id === selectedChannelId ? ' selected' : ''}>${channel.name}</option>`
            ).join('')}
          </select>
        </div>
        <h3 class="text-lg font-medium mb-3 mt-6">Embedded Message Settings</h3>
        <div class="grid grid-cols-1 gap-4">
          <div>
            <label for="embedTitle" class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" id="embedTitle" value="${embedTitle}" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" onchange="onEmbedInputChange()">
          </div>
          <div>
            <label for="embedDescription" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea id="embedDescription" rows="3" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" onchange="onEmbedInputChange()">${embedDescription}</textarea>
          </div>
          <div>
            <label for="buttonLabel" class="block text-sm font-medium text-gray-700 mb-1">Button Title</label>
            <input type="text" id="buttonLabel" value="${embedButtonLabel}" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" onchange="onEmbedInputChange()">
          </div>
          <div>
            <label for="embedColor" class="block text-sm font-medium text-gray-700 mb-1">Embed Color</label>
            <input type="color" id="embedColor" value="${embedColor}" class="w-full h-10 border border-gray-300 rounded-md shadow-sm p-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" onchange="onEmbedInputChange()">
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
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString();
}

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="flex items-center justify-center min-h-screen bg-gray-100">
      <div class="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h2 class="text-2xl font-bold mb-6 text-gray-800">Login</h2>
        <form id="loginForm" class="space-y-4">
          <div>
            <label for="username" class="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input type="text" id="username" name="username" required class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" id="password" name="password" required class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <button type="submit" class="w-full bg-indigo-600 text-white py-2 px-4 rounded hover:bg-indigo-700 transition">Login</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();
    // For now, just redirect to dashboard on submit
    currentView = 'dashboard';
    renderView();
  });
}

const renderDashboard = function() {
  document.getElementById('app').innerHTML = `
    <div class="flex h-screen">
      <div class="bg-gray-800 text-white w-64 flex-shrink-0 h-full flex flex-col justify-between">
        <div>
          <div class="p-4">
            <h2 class="text-xl font-bold mb-6">Dashboard</h2>
            <nav>
              <ul>
                <li class="mb-2">
                  <a href="#" class="flex items-center px-4 py-3 rounded hover:bg-gray-700 transition duration-200" onclick="window.showTicketsOptions(event)">
                    <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path>
                    </svg>
                    Tickets
                  </a>
                </li>
                <li>
                  <a href="#" class="flex items-center px-4 py-3 rounded hover:bg-gray-700 transition duration-200" onclick="window.showSettingsOptions(event)">
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
          <button onclick="window.logout()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
            Logout
          </button>
        </div>
      </div>
      <div id="collapsibleSidebar" class="bg-gray-200 sidebar-transition flex-shrink-0" style="width: ${isCollapsibleOpen ? '250px' : '64px'}">
        <div class="p-3">
          <button onclick="window.toggleCollapsible()" class="w-full flex justify-center items-center p-2 rounded hover:bg-gray-300 transition duration-200">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isCollapsibleOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}"></path>
            </svg>
          </button>
          <div class="mt-4 ${isCollapsibleOpen ? 'block' : 'hidden'}">
            <h3 class="text-lg font-semibold mb-3">Quick Options</h3>
            <ul id="sidebarOptions">
              ${getSidebarContent()}
            </ul>
          </div>
        </div>
      </div>
      <div class="flex-1 p-8 overflow-auto" style="padding-bottom: 0;">
        <div class="bg-white rounded-lg shadow-md p-6">
          ${
            currentSidebarContent === 'tickets'
              ? (currentView === 'ticketDashboard' ? renderDashboardContent() :
                currentView === 'allTickets' ? renderAllTicketsContent() :
                currentView === 'openTickets' ? renderOpenTicketsContent() :
                currentView === 'closedTickets' ? renderClosedTicketsContent() :
                renderDashboardContent())
              : (currentSidebarContent === 'settings'
                ? (currentView === 'integrations' ? renderIntegrationsContent() :
                  currentView === 'botSetup' ? renderBotSetup() :
                  renderSettingsDashboardContent())
                : renderDashboardContent())
          }
        </div>
      </div>
    </div>
  `;
};
function getSidebarContent() {
  if (currentSidebarContent === 'tickets') {
    return `
      <li><a href="#" onclick="window.showTicketDashboard(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Ticket Dashboard</a></li>
      <li><a href="#" onclick="window.showOpenTickets(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Active Tickets</a></li>
      <li><a href="#" onclick="window.showClosedTickets(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Resolved Tickets</a></li>
      <li><a href="#" onclick="window.showAllTickets(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">All Tickets</a></li>
    `;
  } else if (currentSidebarContent === 'settings') {
    return `
      <li><a href="#" onclick="window.showIntegrations(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Integrations</a></li>
      <li><a href="#" onclick="window.showBotSettings(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Bot Setup</a></li>
    `;
  }
  return `<li class="text-gray-700">No quick options available.</li>`;
}


function renderTicketLiveViewContent() {
  if (!currentTicketLiveView) return '<p>No ticket selected.</p>';
  const messages = ticketMessages[currentTicketLiveView] || [];
  console.log('Rendering live ticket view for ticket:', currentTicketLiveView, 'with messages:', messages);
  return window.renderTicketLiveView(currentTicketLiveView, messages, 'window.closeTicketLiveView()');
}

function renderView() {
  localStorage.setItem('currentView', currentView);
  localStorage.setItem('currentSidebarContent', currentSidebarContent);
  if (currentView === 'login') {
    renderLogin();
  } else if (currentView === 'ticketLiveView') {
    document.getElementById('app').innerHTML = `
      <div class="flex h-screen">
        <div class="bg-gray-800 text-white w-64 flex-shrink-0 h-full flex flex-col justify-between">
          <div>
            <div class="p-4">
              <h2 class="text-xl font-bold mb-6">Dashboard</h2>
              <nav>
                <ul>
                  <li class="mb-2">
                    <a href="#" class="flex items-center px-4 py-3 rounded hover:bg-gray-700 transition duration-200" onclick="window.showTicketsOptions(event)">
                      <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isCollapsibleOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}"></path>
                      </svg>
                      Tickets
                    </a>
                  </li>
                  <li>
                    <a href="#" class="flex items-center px-4 py-3 rounded hover:bg-gray-700 transition duration-200" onclick="window.showSettingsOptions(event)">
                      <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                      </svg>
                      Settings
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
          <div class="p-4 mb-4">
            <button onclick="window.logout()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline">
              Logout
            </button>
          </div>
        </div>
        <div id="collapsibleSidebar" class="bg-gray-200 sidebar-transition flex-shrink-0" style="width: ${isCollapsibleOpen ? '250px' : '64px'}">
          <div class="p-3">
            <button onclick="window.toggleCollapsible()" class="w-full flex justify-center items-center p-2 rounded hover:bg-gray-300 transition duration-200">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isCollapsibleOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}"></path>
              </svg>
            </button>
            <div class="mt-4 ${isCollapsibleOpen ? 'block' : 'hidden'}">
              <h3 class="text-lg font-semibold mb-3">Quick Options</h3>
              <ul id="sidebarOptions">
                ${getSidebarContent()}
              </ul>
            </div>
          </div>
        </div>
        <div class="flex-1 p-8 overflow-auto" style="padding-bottom: 0;">
          <div class="bg-white rounded-lg shadow-md p-6">
            ${renderTicketLiveViewContent()}
          </div>
        </div>
      </div>
    </div>
    `;
  } else {
    renderDashboard();
  }
}

// --- WEBSOCKET & API ---
let ws;
let wsRetryCount = 0;
const MAX_RETRY_COUNT = 3;

function setupWebSocket() {
  if (ws) ws.close();
  ws = new window.WebSocket('ws://localhost:4001');
  ws.onopen = () => {
    wsRetryCount = 0;
    ws.send(JSON.stringify({ type: 'GET_GUILD_STATUS' }));
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);
      if (data.type === 'GUILD_UPDATE' || data.type === 'GUILD_STATUS') {
        if (data.guilds && data.guilds.length > 0) {
          discordConnected = true;
          connectedServer = data.guilds[0].name;
          connectedGuildId = data.guilds[0].id;
          fetchChannelsForGuild(connectedGuildId);
          fetchTicketsForGuild(connectedGuildId);
        } else {
          discordConnected = false;
          connectedServer = '';
          connectedGuildId = '';
          availableChannels = [];
          tickets = [];
          renderView();
        }
      } else if (data.type === 'TICKET_MESSAGE') {
        // New WebSocket message for live ticket update
        let ticketNumber = data.ticketNumber;
        // Normalize ticketNumber to string with leading zeros length 4
        ticketNumber = ticketNumber.toString().padStart(4, '0');
        const message = data.message;
        if (!ticketMessages[ticketNumber]) {
          ticketMessages[ticketNumber] = [];
        }
        ticketMessages[ticketNumber].push(message);
        // If currently viewing this ticket live, re-render
        if (currentTicketLiveView === ticketNumber) {
          renderView();
        }
      }
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };
  ws.onclose = () => {
    if (wsRetryCount < MAX_RETRY_COUNT) {
      wsRetryCount++;
      setTimeout(setupWebSocket, 2000);
    }
  };
  ws.onerror = (error) => {
    console.error('WebSocket Error:', error);
  };
}
function fetchChannelsForGuild(guildId) {
  fetch(`${API_BASE}/api/channels/${guildId}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch channels');
      return res.json();
    })
    .then(channels => {
      availableChannels = channels || [];
      if (!availableChannels.find(c => c.id === selectedChannelId)) {
        selectedChannelId = '';
        localStorage.removeItem('selectedChannelId');
      }
      renderView();
    })
    .catch(err => {
      availableChannels = [];
      renderView();
    });
}

function fetchCategoriesForGuild(guildId) {
  fetch(`${API_BASE}/api/categories/${guildId}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    })
    .then(categories => {
      availableCategories = categories || [];
      if (!availableCategories.find(c => c.id === selectedCategoryId)) {
        selectedCategoryId = '';
        localStorage.removeItem('selectedCategoryId');
      }
      renderView();
    })
    .catch(err => {
      availableCategories = [];
      renderView();
    });
}
function fetchTicketsForGuild(guildId) {
  fetch(`${API_BASE}/api/tickets/${guildId}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch tickets');
      return res.json();
    })
    .then(data => {
      tickets = data || [];
      updateTicketDashboardStats();
      renderView();
    })
    .catch(err => {
      tickets = [];
      ticketDashboardStats = { active: 0, resolvedToday: 0, newMessages: 0 };
      ticketActivity = [];
      renderView();
    });
}
function updateTicketDashboardStats() {
  const now = new Date();
  let active = 0, resolvedToday = 0, newMessages = 0;
  let activity = [];
  tickets.forEach(ticket => {
    if (ticket.status === 'active') active++;
    if (ticket.status === 'closed') {
      const last = new Date(ticket.lastUpdated);
      if (last.toDateString() === now.toDateString()) resolvedToday++;
    }
    activity.push({
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      lastUpdated: ticket.lastUpdated,
      userId: ticket.userId,
      username: ticket.username || 'Unknown'
    });
  });
  ticketDashboardStats = { active, resolvedToday, newMessages: 0 };
  ticketActivity = activity.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated)).slice(0, 10);
}
function pollGuildStatus() {
  setInterval(() => {
    fetch(`${API_BASE}/api/guilds`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(guilds => {
        if (guilds && guilds.length > 0) {
          discordConnected = true;
          connectedServer = guilds[0].name;
          connectedGuildId = guilds[0].id;
          fetchChannelsForGuild(connectedGuildId);
          fetchCategoriesForGuild(connectedGuildId);
          fetchTicketsForGuild(connectedGuildId);
        } else {
          discordConnected = false;
          connectedServer = '';
          connectedGuildId = '';
          availableChannels = [];
          availableCategories = [];
          tickets = [];
          renderView();
        }
      })
      .catch(error => {
        console.error('Error polling guild status:', error);
      });
  }, 5000);
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  renderView();
  setupWebSocket();
  pollGuildStatus();
});

// --- EXPOSE FUNCTIONS TO WINDOW FOR INLINE HANDLERS ---
window.toggleCollapsible = toggleCollapsible;
window.showTicketsOptions = showTicketsOptions;
window.showSettingsOptions = showSettingsOptions;
window.showTicketDashboard = showTicketDashboard;
window.showAllTickets = showAllTickets;
window.showOpenTickets = showOpenTickets;
window.showClosedTickets = showClosedTickets;
window.showIntegrations = showIntegrations;
window.showBotSettings = showBotSettings;
window.logout = logout;
window.onChannelSelectChange = onChannelSelectChange;
window.onEmbedInputChange = onEmbedInputChange;
window.previewEmbed = previewEmbed;
window.goBackToDashboard = goBackToDashboard;
window.deployEmbed = deployEmbed;

// New functions for live ticket view
window.openTicketLiveView = function(ticketNumber) {
  // Normalize ticketNumber to string with leading zeros length 4
  ticketNumber = ticketNumber.toString().padStart(4, '0');
  currentTicketLiveView = ticketNumber;
  // Fetch initial messages for the ticket
  fetch(`${API_BASE}/api/ticket-messages/${ticketNumber}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch ticket messages');
      return res.json();
    })
    .then(data => {
      ticketMessages[ticketNumber] = data || [];
      currentView = 'ticketLiveView';
      renderView();
    })
    .catch(err => {
      ticketMessages[ticketNumber] = [];
      currentView = 'ticketLiveView';
      renderView();
    });
};

window.closeTicketLiveView = function() {
  currentTicketLiveView = null;
  currentView = 'allTickets'; // or previous view if you want to track it
  renderView();
};