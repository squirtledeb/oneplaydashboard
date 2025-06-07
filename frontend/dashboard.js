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
let formQuestions = []; // Store form questions
let autoDisplayFormResults = false; // New state for auto display toggle
let userTicketHistory = [];
let userTicketHistoryUserId = null;
let userTicketHistoryLoading = false;

// Fix: Fetch auto display form results on page load to set checkbox state correctly
window.fetchAutoDisplayFormResults = function() {
  fetch(`${API_BASE}/api/auto-display-form-results`)
    .then(res => res.json())
    .then(data => {
      autoDisplayFormResults = data.enabled || false;
      renderView();
    })
    .catch(err => {
      autoDisplayFormResults = false;
      renderView();
    });
};

// Call fetchAutoDisplayFormResults on initial load to sync checkbox state
window.fetchAutoDisplayFormResults();

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
function showFormSetup(event) {
  event.preventDefault();
  currentView = 'formSetup';
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
    parentCategoryId: selectedCategoryId || ''
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
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-800">Recent Ticket Activity</h2>
        <div class="relative" id="searchBarContainer" style="width: 480px;">
          <input id="ticketSearchInput" type="text" placeholder="Search" class="w-full pl-4 pr-10 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200" onfocus="window.showSearchOptionsMenu()" onblur="window.hideSearchOptionsMenu()" oninput="window.handleTicketSearch(); window.toggleSearchIcon(); window.toggleSearchLayout();" onkeydown="window.handleSearchEnter(event)" autocomplete="off" />
          <span id="searchIcon" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <span id="clearIcon" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer hidden" onclick="window.clearSearch()">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
          <div id="searchOptionsMenu" class="hidden absolute left-0 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4" style="min-width: 320px;">
            <div class="text-gray-800 font-semibold mb-2">Search Options</div>
            <div id="searchOptionsList" class="text-gray-600 text-sm space-y-1">
              <div class="search-option flex items-center justify-between px-2 py-2 rounded cursor-pointer" data-option="from" onmouseenter="window.highlightSearchOption('from')" onmouseleave="window.unhighlightSearchOption('from')" tabindex="0">
                <span><span class="font-semibold">from:</span> user</span>
                <span class="plus-icon hidden text-lg font-bold text-gray-500">+</span>
              </div>
              <div class="search-option flex items-center justify-between px-2 py-2 rounded cursor-pointer" data-option="mentions" onmouseenter="window.highlightSearchOption('mentions')" onmouseleave="window.unhighlightSearchOption('mentions')" tabindex="0">
                <span><span class="font-semibold">mentions:</span> user</span>
                <span class="plus-icon hidden text-lg font-bold text-gray-500">+</span>
              </div>
              <div class="search-option flex items-center justify-between px-2 py-2 rounded cursor-pointer" data-option="has" onmouseenter="window.highlightSearchOption('has')" onmouseleave="window.unhighlightSearchOption('has')" tabindex="0">
                <span><span class="font-semibold">has:</span> link, embed or file</span>
                <span class="plus-icon hidden text-lg font-bold text-gray-500">+</span>
              </div>
              <div class="search-option flex items-center justify-between px-2 py-2 rounded cursor-pointer" data-option="before" onmouseenter="window.highlightSearchOption('before')" onmouseleave="window.unhighlightSearchOption('before')" tabindex="0">
                <span><span class="font-semibold">before:</span> specific date</span>
                <span class="plus-icon hidden text-lg font-bold text-gray-500">+</span>
              </div>
              <div class="search-option flex items-center justify-between px-2 py-2 rounded cursor-pointer" data-option="during" onmouseenter="window.highlightSearchOption('during')" onmouseleave="window.unhighlightSearchOption('during')" tabindex="0">
                <span><span class="font-semibold">during:</span> specific date</span>
                <span class="plus-icon hidden text-lg font-bold text-gray-500">+</span>
              </div>
              <div class="search-option flex items-center justify-between px-2 py-2 rounded cursor-pointer" data-option="after" onmouseenter="window.highlightSearchOption('after')" onmouseleave="window.unhighlightSearchOption('after')" tabindex="0">
                <span><span class="font-semibold">after:</span> specific date</span>
                <span class="plus-icon hidden text-lg font-bold text-gray-500">+</span>
              </div>
              <div class="search-option flex items-center justify-between px-2 py-2 rounded cursor-pointer" data-option="pinned" onmouseenter="window.highlightSearchOption('pinned')" onmouseleave="window.unhighlightSearchOption('pinned')" tabindex="0">
                <span><span class="font-semibold">pinned:</span> true or false</span>
                <span class="plus-icon hidden text-lg font-bold text-gray-500">+</span>
              </div>
            </div>
          </div>
          <div id="searchResultsBox" class="hidden absolute left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-6" style="width: 480px; min-width: 320px; transition: width 0.2s; z-index: 30;">
            <h3 class="text-lg font-semibold mb-4 text-gray-800">Search Results</h3>
            <div id="searchResultsContent" class="text-gray-700">No results yet.</div>
          </div>
        </div>
      </div>
      <div id="ticketActivityFlex" class="w-full">
        <div id="ticketActivityLayout" class="w-full" style="transition: width 0.2s, margin-top 0.2s;">
          <div class="border rounded-lg overflow-hidden mt-0">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200" id="ticketActivityTableBody">
                ${window.renderTicketActivityRows()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.handleTicketSearch = function() {
  const input = document.getElementById('ticketSearchInput');
  const value = input.value.trim().toLowerCase();
  window.filteredTicketActivity = value
    ? ticketActivity.filter(t =>
        t.ticketNumber.toString().toLowerCase().includes(value) ||
        (t.username && t.username.toLowerCase().includes(value))
      )
    : null;
  window.renderTicketActivityTable();
};

window.renderTicketActivityRows = function() {
  const data = window.filteredTicketActivity || ticketActivity;
  return data.map(t => `
    <tr>
      <td class="px-6 py-4 whitespace-nowrap">#${t.ticketNumber}</td>
      <td class="px-6 py-4 whitespace-nowrap">${t.username || 'Unknown'}</td>
      <td class="px-6 py-4 whitespace-nowrap">
        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${t.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${t.status === 'active' ? 'Active' : (t.status === 'closed' ? 'Resolved' : t.status)}</span>
      </td>
    </tr>
  `).join('');
};

window.renderTicketActivityTable = function() {
  const tbody = document.getElementById('ticketActivityTableBody');
  if (tbody) tbody.innerHTML = window.renderTicketActivityRows();
};

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
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Panel Config</h1>
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
        <div class="mb-4">
          <label for="loggingChannelSelect" class="block text-sm font-medium text-gray-700 mb-2">Select Log Channel</label>
          <select id="loggingChannelSelect" class="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" onchange="onLoggingChannelSelectChange(this)">
            <option value="">-- Select a log channel --</option>
            ${availableChannels.map(channel => 
              `<option value="${channel.id}"${channel.id === selectedLoggingChannelId ? ' selected' : ''}>${channel.name}</option>`
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

let selectedLoggingChannelId = '';

window.onLoggingChannelSelectChange = function(select) {
  selectedLoggingChannelId = select.value;
  console.log('Attempting to set log channel:', selectedLoggingChannelId, 'for guild:', connectedGuildId);
  // Save the logging channel setting via API
  if (!connectedGuildId) return;
  fetch(`${API_BASE}/api/logging-channel/${connectedGuildId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: selectedLoggingChannelId })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      alert('Failed to save logging channel setting.');
    }
  })
  .catch(err => {
    alert('Error saving logging channel setting: ' + err.message);
  });
}

// Fetch current logging channel setting for the guild
function fetchLoggingChannelForGuild(guildId) {
  return fetch(`${API_BASE}/api/logging-channel/${guildId}`)
    .then(res => res.json())
    .then(data => {
      selectedLoggingChannelId = data.channelId || '';
    })
    .catch(err => {
      selectedLoggingChannelId = '';
    });
}

// Modify fetchChannelsForGuild to also fetch logging channel setting and render after both are done
const originalFetchChannelsForGuild = fetchChannelsForGuild;
fetchChannelsForGuild = function(guildId) {
  originalFetchChannelsForGuild(guildId);
  fetch(`${API_BASE}/api/channels/${guildId}`)
    .then(res => res.json())
    .then(channels => {
      availableChannels = channels;
      return fetchLoggingChannelForGuild(guildId);
    })
    .then(() => {
      renderView();
    });
};

function renderFormSetupView() {
  return `
    <h1 class="text-2xl font-bold mb-6 text-gray-800">Form Setup</h1>
    <p class="mb-6 text-gray-600">Configure the form questions that users will fill when creating a support ticket.</p>
    
    <div class="border rounded-lg p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">Current Form Questions</h2>
      ${formQuestions.length === 0 ? 
        '<p class="text-gray-500 mb-4">No questions configured yet. Add your first question below.</p>' :
        `<div class="space-y-4 mb-4">
          <div class="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-700">
            <div class="col-span-3">Question Title</div>
            <div class="col-span-3">Question Placeholder</div>
            <div class="col-span-1">Min Required</div>
            <div class="col-span-1">Max Required</div>
            <div class="col-span-2">Required</div>
            <div class="col-span-2">Multi-line</div>
            <div class="col-span-12 text-right">Actions</div>
          </div>
          ${formQuestions.map((q, index) => `
            <div class="grid grid-cols-12 gap-4 items-center bg-gray-50 p-3 rounded-lg">
              <input 
                type="text" 
                class="col-span-3 border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm" 
                value="${q.question}" 
                onchange="window.updateFormQuestion(${index}, 'question', this.value)"
              />
              <input 
                type="text" 
                class="col-span-3 border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm" 
                value="${q.placeholder || ''}" 
                placeholder="Enter placeholder" 
                onchange="window.updateFormQuestion(${index}, 'placeholder', this.value)"
              />
              <input 
                type="number" 
                min="0" 
                class="col-span-1 border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm" 
                value="${q.min || 0}" 
                onchange="window.updateFormQuestion(${index}, 'min', this.value)"
              />
              <input 
                type="number" 
                min="0" 
                class="col-span-1 border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm" 
                value="${q.max || 500}" 
                onchange="window.updateFormQuestion(${index}, 'max', this.value)"
              />
              <div class="col-span-2 flex items-center space-x-2">
                <input type="checkbox" ${q.required ? 'checked' : ''} onchange="window.updateFormQuestion(${index}, 'required', this.checked)" />
                <label>Required</label>
              </div>
              <div class="col-span-2 flex items-center space-x-2">
                <input type="checkbox" ${q.multiline ? 'checked' : ''} onchange="window.updateFormQuestion(${index}, 'multiline', this.checked)" />
                <label>Multi-line</label>
              </div>
              <div class="col-span-12 text-right">
                <button onclick="window.removeFormQuestion(${index})" class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition text-sm">
                  Remove
                </button>
              </div>
            </div>
          `).join('')}
        </div>`
      }
      
      <div class="mt-4 mb-6 flex items-center space-x-2">
        <input type="checkbox" id="autoDisplayFormResultsCheckbox" ${autoDisplayFormResults ? 'checked' : ''} onchange="window.toggleAutoDisplayFormResults(this.checked)" />
        <label for="autoDisplayFormResultsCheckbox" class="text-gray-700 text-sm select-none">Auto display form results on the <span class="font-mono">Ticket Message</span> as an additional embed.</label>
      </div>
      
      <div class="border-t pt-4">
        <h3 class="text-lg font-medium mb-3">Add New Question</h3>
        <div class="flex gap-3">
          <input 
            type="text" 
            id="newQuestionInput" 
            placeholder="Enter your question..." 
            class="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
          <button 
            onclick="window.addFormQuestion()" 
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Add Question
          </button>
        </div>
      </div>
      <div class="mt-4 text-right">
        <button onclick="window.syncFormQuestions()" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition">
          Sync Form Questions
        </button>
      </div>
    </div>
    
    <div class="mt-6 text-right">
      <button onclick="goBackToDashboard()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
        Back to Dashboard
      </button>
    </div>
  `;
}

window.toggleAutoDisplayFormResults = function(checked) {
  autoDisplayFormResults = checked;
  window.syncAutoDisplayFormResults();
};

window.syncAutoDisplayFormResults = function() {
  fetch(`${API_BASE}/api/auto-display-form-results`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: autoDisplayFormResults })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      alert('Failed to save auto display setting.');
    }
  })
  .catch(err => {
    alert('Error saving auto display setting: ' + err.message);
  });
};

window.fetchAutoDisplayFormResults = function() {
  fetch(`${API_BASE}/api/auto-display-form-results`)
    .then(res => res.json())
    .then(data => {
      autoDisplayFormResults = data.enabled || false;
      renderView();
    })
    .catch(err => {
      autoDisplayFormResults = false;
      renderView();
    });
};

// Modify fetchFormQuestions to also fetch auto display setting
const originalFetchFormQuestions = window.fetchFormQuestions;
window.fetchFormQuestions = function() {
  Promise.all([
    fetch(`${API_BASE}/api/form-questions`).then(res => res.json()),
    fetch(`${API_BASE}/api/auto-display-form-results`).then(res => res.json())
  ])
  .then(([questionsData, autoDisplayData]) => {
    formQuestions = questionsData || [];
    autoDisplayFormResults = autoDisplayData.enabled || false;
    window.formQuestions = formQuestions;
    renderView();
  })
  .catch(err => {
    formQuestions = [];
    autoDisplayFormResults = false;
    window.formQuestions = formQuestions;
    renderView();
  });
};

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
                  currentView === 'formSetup' ? renderFormSetupView() :
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
      <li><a href="#" onclick="window.showBotSettings(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Panel Config</a></li>
      <li><a href="#" onclick="window.showFormSetup(event)" class="block py-2 px-4 hover:bg-gray-300 rounded">Form Setup</a></li>
    `;
  }
  return `<li class="text-gray-700">No quick options available.</li>`;
}

function renderTicketLiveViewContent() {
  if (!currentTicketLiveView) return '<p>No ticket selected.</p>';
  const messages = ticketMessages[currentTicketLiveView] || [];
  let formResponses = null;
  let userId = null;
  // Try to find the ticket in the main tickets array
  for (const ticket of tickets) {
    if (ticket.ticketNumber.toString().padStart(4, '0') === currentTicketLiveView) {
      formResponses = ticket.formResponses;
      userId = ticket.userId;
      break;
    }
  }
  // If not found, look in userTicketHistory
  if (!formResponses && userTicketHistory && userTicketHistory.length > 0) {
    for (const ticket of userTicketHistory) {
      if (ticket.ticketNumber.toString().padStart(4, '0') === currentTicketLiveView) {
        formResponses = ticket.formResponses;
        userId = ticket.userId;
        break;
      }
    }
  }
  // Always fetch the full ticket history for the user when viewing any ticket
  if (userId && (userTicketHistoryUserId !== userId || userTicketHistoryLoading)) {
    userTicketHistoryLoading = true;
    fetch(`${API_BASE}/api/user-tickets/${userId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch user ticket history');
        return res.json();
      })
      .then(data => {
        userTicketHistory = data || [];
        userTicketHistoryUserId = userId;
        userTicketHistoryLoading = false;
        renderView();
      })
      .catch(err => {
        console.error('Failed to fetch user ticket history:', err);
        userTicketHistory = [];
        userTicketHistoryUserId = userId;
        userTicketHistoryLoading = false;
        renderView();
      });
    // Show loading state until fetched
    return window.renderTicketLiveView(currentTicketLiveView, messages, 'window.closeTicketLiveView()', formResponses, []);
  }
  // Always show all tickets for the user in userTicketHistory
  return window.renderTicketLiveView(currentTicketLiveView, messages, 'window.closeTicketLiveView()', formResponses, userTicketHistory);
}

// Fetch ticket messages for live view
function fetchTicketMessages(ticketNumber) {
  console.log(`Fetching messages for ticket ${ticketNumber}`);
  fetch(`${API_BASE}/api/ticket-messages/${ticketNumber}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch ticket messages');
      return res.json();
    })
    .then(data => {
      ticketMessages[ticketNumber] = data || [];
      renderView();
    })
    .catch(err => {
      ticketMessages[ticketNumber] = [];
      renderView();
    });
}

// Open live ticket view and fetch messages
window.openTicketLiveView = function(ticketNumber) {
  currentTicketLiveView = ticketNumber.toString().padStart(4, '0');
  fetchTicketMessages(currentTicketLiveView);
  currentView = 'ticketLiveView';
  renderView();
};

// Close live ticket view
window.closeTicketLiveView = function() {
  currentTicketLiveView = null;
  currentView = 'dashboard';
  renderView();
};

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
          fetchCategoriesForGuild(connectedGuildId);
          fetchTicketsForGuild(connectedGuildId);
        } else {
          discordConnected = false;
          connectedServer = '';
          connectedGuildId = '';
          availableChannels = [];
          tickets = [];
          if (currentView !== 'botSetup') {
            renderView();
          }
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
        // Check if message already exists to avoid duplicates
        if (!ticketMessages[ticketNumber].some(msg => msg.timestamp === message.timestamp && msg.content === message.content && msg.sender === message.sender)) {
          ticketMessages[ticketNumber].push(message);
        }
        console.log(`Added message to ticket ${ticketNumber}:`, message);
        // If currently viewing this ticket live, re-render
        if (currentTicketLiveView === ticketNumber) {
          console.log(`Currently viewing ticket ${ticketNumber}, rendering view.`);
          renderView();
        }
      } else if (data.type === 'TICKET_UPDATE') {
        const updatedTicket = data.ticket;
        if (!updatedTicket) {
          // Do not remove the ticket from the tickets array; just re-render to update UI
          updateTicketDashboardStats();
          renderView();
          return;
        }
        const index = tickets.findIndex(t => t.ticketNumber === updatedTicket.ticketNumber);
        if (index !== -1) {
          tickets[index] = updatedTicket;
        } else {
          tickets.push(updatedTicket);
        }
        updateTicketDashboardStats();
        renderView();
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
          if (currentView !== 'botSetup') {
            renderView();
          }
        }
      })
      .catch(error => {
        console.error('Error polling guild status:', error);
      });
  }, 5000);
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  // Restore state from localStorage
  currentView = localStorage.getItem('currentView') || 'login';
  currentSidebarContent = localStorage.getItem('currentSidebarContent') || 'tickets';
  selectedCategoryId = localStorage.getItem('selectedCategoryId') || '';
  selectedChannelId = localStorage.getItem('selectedChannelId') || '';
  embedTitle = localStorage.getItem('embedTitle') || 'Support Ticket System';
  embedDescription = localStorage.getItem('embedDescription') || 'Click the button below to create a new support ticket.';
  embedButtonLabel = localStorage.getItem('embedButtonLabel') || 'Create Ticket';
  embedColor = localStorage.getItem('embedColor') || '#5865F2';

  renderView();
  setupWebSocket();
  fetchFormQuestions();

  // Fetch initial data for the connected guild if any
  if (connectedGuildId) {
    fetchChannelsForGuild(connectedGuildId);
    fetchCategoriesForGuild(connectedGuildId);
    fetchTicketsForGuild(connectedGuildId);
  }
  // Removed pollGuildStatus to prevent periodic refresh causing scroll reset
  // pollGuildStatus();
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
window.showFormSetup = showFormSetup;
window.logout = logout;
window.onChannelSelectChange = onChannelSelectChange;
window.onEmbedInputChange = onEmbedInputChange;
window.previewEmbed = previewEmbed;
window.goBackToDashboard = goBackToDashboard;
window.deployEmbed = deployEmbed;

// Form questions management functions
function addFormQuestion() {
  const questionInput = document.getElementById('newQuestionInput');
  const question = questionInput.value.trim();
  if (!question) {
    alert('Please enter a question');
    return;
  }
  
  const newQuestion = {
    id: 'q' + Date.now(),
    question: question,
    placeholder: '',
    min: 0,
    max: 500,
    required: false,
    multiline: false
  };
  
  formQuestions.push(newQuestion);
  window.formQuestions = formQuestions;
  questionInput.value = '';
  saveFormQuestions();
  renderView();
}

function removeFormQuestion(index) {
  formQuestions.splice(index, 1);
  window.formQuestions = formQuestions;
  saveFormQuestions();
  renderView();
}

function saveFormQuestions() {
  fetch(`${API_BASE}/api/form-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions: formQuestions })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        console.error('Failed to save form questions:', data.error);
      }
    })
    .catch(err => {
      console.error('Error saving form questions:', err);
    });
}

function fetchFormQuestions() {
  fetch(`${API_BASE}/api/form-questions`)
    .then(res => res.json())
    .then(data => {
      formQuestions = data || [];
      window.formQuestions = formQuestions;
      renderView();
    })
    .catch(err => {
      console.error('Error fetching form questions:', err);
      formQuestions = [];
      window.formQuestions = formQuestions;
    });
}

function updateFormQuestion(index, field, value) {
  console.log(`updateFormQuestion called with index=${index}, field=${field}, value=`, value);
  if (index < 0 || index >= formQuestions.length) return;
  const question = formQuestions[index];
  if (!question) return;

  if (field === 'min' || field === 'max') {
    const num = parseInt(value, 10);
    question[field] = isNaN(num) ? 0 : num;
  } else if (field === 'required' || field === 'multiline') {
    question[field] = !!value;
  } else {
    question[field] = value;
  }

  formQuestions[index] = question;
  window.formQuestions = formQuestions;
  // Removed automatic saveFormQuestions call here to avoid redundant saves
  renderView();
}

function syncFormQuestions() {
  saveFormQuestions();
  alert('Form questions synced to the bot successfully.');
}

window.syncFormQuestions = syncFormQuestions;

// Add to window object for inline handlers
window.addFormQuestion = addFormQuestion;
window.removeFormQuestion = removeFormQuestion;
window.updateFormQuestion = updateFormQuestion;
window.formQuestions = formQuestions;

window.showSearchOptionsMenu = function() {
  setTimeout(() => {
    const menu = document.getElementById('searchOptionsMenu');
    if (menu) menu.classList.remove('hidden');
  }, 50);
};
window.hideSearchOptionsMenu = function() {
  setTimeout(() => {
    const menu = document.getElementById('searchOptionsMenu');
    if (menu) menu.classList.add('hidden');
  }, 150);
};

window.highlightSearchOption = function(option) {
  document.querySelectorAll('.search-option').forEach(el => {
    if (el.getAttribute('data-option') === option) {
      el.classList.add('bg-gray-200');
      el.querySelector('.plus-icon').classList.remove('hidden');
    } else {
      el.classList.remove('bg-gray-200');
      el.querySelector('.plus-icon').classList.add('hidden');
    }
  });
};
window.unhighlightSearchOption = function(option) {
  document.querySelectorAll('.search-option').forEach(el => {
    el.classList.remove('bg-gray-200');
    el.querySelector('.plus-icon').classList.add('hidden');
  });
};

window.handleSearchEnter = function(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const input = document.getElementById('ticketSearchInput');
    const value = input.value.trim();
    if (!value) return;
    const box = document.getElementById('searchResultsBox');
    const content = document.getElementById('searchResultsContent');
    if (box && content) {
      box.classList.remove('hidden');
      // For now, just show the query. You can replace this with actual search results.
      content.textContent = `Results for: "${value}"`;
    }
  }
};

window.toggleSearchIcon = function() {
  const input = document.getElementById('ticketSearchInput');
  const searchIcon = document.getElementById('searchIcon');
  const clearIcon = document.getElementById('clearIcon');
  if (input && input.value.trim()) {
    if (searchIcon) searchIcon.classList.add('hidden');
    if (clearIcon) clearIcon.classList.remove('hidden');
  } else {
    if (searchIcon) searchIcon.classList.remove('hidden');
    if (clearIcon) clearIcon.classList.add('hidden');
    // Also hide search results if input is cleared
    const box = document.getElementById('searchResultsBox');
    if (box) box.classList.add('hidden');
    window.filteredTicketActivity = null;
    window.renderTicketActivityTable();
  }
};

window.clearSearch = function() {
  const input = document.getElementById('ticketSearchInput');
  if (input) input.value = '';
  window.toggleSearchIcon();
  // Hide search results and reset table
  const box = document.getElementById('searchResultsBox');
  if (box) box.classList.add('hidden');
  window.filteredTicketActivity = null;
  window.renderTicketActivityTable();
};

window.toggleSearchLayout = function() {
  const input = document.getElementById('ticketSearchInput');
  const resultsBox = document.getElementById('searchResultsBox');
  const searchBarContainer = document.getElementById('searchBarContainer');
  const layout = document.getElementById('ticketActivityLayout');
  if (input && input.value.trim()) {
    if (resultsBox) resultsBox.classList.remove('hidden');
    if (searchBarContainer) searchBarContainer.style.width = '480px';
    if (layout) {
      layout.style.width = '560px';
      layout.style.marginTop = '0.5rem';
    }
  } else {
    if (resultsBox) resultsBox.classList.add('hidden');
    if (searchBarContainer) searchBarContainer.style.width = '';
    if (layout) {
      layout.style.width = '100%';
      layout.style.marginTop = '';
    }
  }
};