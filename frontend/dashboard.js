import { addOrUpdateUserTicket, updateUserTickets } from './userTicketHistory.js';
import { renderTicketLiveView } from './ticketliveview.js';

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
let currentTicketLiveView = null;
let ticketMessages = {};
let formQuestions = [];
let autoDisplayFormResults = false;
let selectedLoggingChannelId = '';
let ws = null;
let manualDisconnect = false;
let pollingInterval = null;

// --- WEBSOCKET SETUP ---
function setupWebSocket() {
  if (ws) {
    ws.close();
  }
  ws = new WebSocket('ws://localhost:4001');
  ws.onopen = () => {
    console.log('WebSocket connected');
    ws.send(JSON.stringify({ type: 'GET_GUILD_STATUS' }));
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'GUILD_STATUS' || data.type === 'GUILD_UPDATE') {
        if (data.guilds && data.guilds.length > 0) {
          discordConnected = true;
          connectedGuildId = data.guilds[0].id;
          connectedServer = data.guilds[0].name;
          fetchChannelsForGuild(connectedGuildId);
          fetchTickets(connectedGuildId);
        } else if (!manualDisconnect) {
          discordConnected = false;
          connectedServer = '';
          connectedGuildId = '';
          availableChannels = [];
          tickets = [];
          renderView();
        }
      } else if (data.type === 'TICKET_UPDATE') {
        handleTicketUpdate(data);
      } else if (data.type === 'TICKET_MESSAGE') {
        handleTicketMessage(data);
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  };
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    if (!manualDisconnect) {
      setTimeout(setupWebSocket, 5000);
    }
  };
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// --- TICKET HANDLING ---
function handleTicketUpdate(data) {
  const { guildId, ticketNumber, ticket } = data;
  if (guildId !== connectedGuildId) return;
  if (ticket) {
    const existingIndex = tickets.findIndex(t => t.ticketNumber === ticketNumber);
    if (existingIndex !== -1) {
      tickets[existingIndex] = { ...ticket, guildId };
    } else {
      tickets.push({ ...ticket, guildId });
    }
    if (ticket.userId) {
      addOrUpdateUserTicket(ticket.userId, {
        guildId,
        ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt,
        lastUpdated: ticket.lastUpdated,
        panelTitle: ticket.panelTitle || 'Unknown Panel'
      });
    }
  } else {
    tickets = tickets.filter(t => t.ticketNumber !== ticketNumber);
  }
  updateTicketStats();
  renderView();
}

function handleTicketMessage(data) {
  const { ticketNumber, message } = data;
  if (!ticketMessages[ticketNumber]) {
    ticketMessages[ticketNumber] = [];
  }
  ticketMessages[ticketNumber].push(message);
  updateTicketStats();
  if (currentTicketLiveView === ticketNumber) {
    openTicketLiveView(ticketNumber, connectedGuildId);
  }
}

function updateTicketStats() {
  ticketDashboardStats.active = tickets.filter(t => t.status === 'active').length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  ticketDashboardStats.resolvedToday = tickets.filter(t => 
    t.status === 'closed' && new Date(t.lastUpdated) >= today
  ).length;
  ticketDashboardStats.newMessages = Object.values(ticketMessages).reduce((sum, msgs) => sum + msgs.length, 0);
  ticketActivity = tickets.slice(-5).reverse();
}

// --- API FETCH FUNCTIONS ---
function fetchTickets(guildId) {
  fetch(`${API_BASE}/api/tickets/${guildId}`)
    .then(res => res.json())
    .then(data => {
      tickets = data || [];
      tickets.forEach(ticket => {
        if (ticket.userId) {
          addOrUpdateUserTicket(ticket.userId, {
            guildId,
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            createdAt: ticket.createdAt,
            lastUpdated: ticket.lastUpdated,
            panelTitle: ticket.panelTitle || 'Unknown Panel'
          });
        }
      });
      updateTicketStats();
      renderView();
    })
    .catch(err => {
      console.error('Error fetching tickets:', err);
      tickets = [];
      updateTicketStats();
      renderView();
    });
}

function fetchChannelsForGuild(guildId) {
  fetch(`${API_BASE}/api/channels/${guildId}`)
    .then(res => res.json())
    .then(data => {
      availableChannels = data || [];
      fetch(`${API_BASE}/api/categories/${guildId}`)
        .then(res => res.json())
        .then(catData => {
          availableCategories = catData || [];
          fetch(`${API_BASE}/api/logging-channel/${guildId}`)
            .then(res => res.json())
            .then(logData => {
              selectedLoggingChannelId = logData.channelId || '';
              renderView();
            })
            .catch(err => {
              console.error('Error fetching logging channel:', err);
              selectedLoggingChannelId = '';
              renderView();
            });
        })
        .catch(err => {
          console.error('Error fetching categories:', err);
          availableCategories = [];
          renderView();
        });
    })
    .catch(err => {
      console.error('Error fetching channels:', err);
      availableChannels = [];
      renderView();
    });
}

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

// --- FORM QUESTION MANAGEMENT ---
window.addFormQuestion = function() {
  const input = document.getElementById('newQuestionInput');
  if (input && input.value.trim()) {
    formQuestions.push({
      id: `q${Date.now()}`,
      question: input.value.trim(),
      placeholder: '',
      min: 0,
      max: 500,
      required: false,
      multiline: false
    });
    input.value = '';
    renderView();
  }
};

window.updateFormQuestion = function(index, field, value) {
  if (index >= 0 && index < formQuestions.length) {
    if (field === 'min' || field === 'max') {
      value = parseInt(value) || 0;
    }
    formQuestions[index] = { ...formQuestions[index], [field]: value };
    renderView();
  }
};

window.removeFormQuestion = function(index) {
  if (index >= 0 && index < formQuestions.length) {
    formQuestions.splice(index, 1);
    renderView();
  }
};

window.syncFormQuestions = function() {
  fetch(`${API_BASE}/api/form-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions: formQuestions })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert('Form questions synced successfully!');
      } else {
        alert('Failed to sync form questions.');
      }
    })
    .catch(err => {
      alert('Error syncing form questions: ' + err.message);
    });
};

// --- HANDLER FUNCTIONS ---
function toggleCollapsible() {
  isCollapsibleOpen = !isCollapsibleOpen;
  renderView();
}

function showTicketsOptions(event) {
  event.preventDefault();
  currentSidebarContent = 'tickets';
  localStorage.setItem('currentSidebarContent', 'tickets');
  renderView();
}

function showSettingsOptions(event) {
  event.preventDefault();
  currentSidebarContent = 'settings';
  localStorage.setItem('currentSidebarContent', 'settings');
  renderView();
}

function showTicketDashboard(event) {
  event.preventDefault();
  currentView = 'ticketDashboard';
  localStorage.setItem('currentView', 'ticketDashboard');
  renderView();
}

function showAllTickets(event) {
  event.preventDefault();
  currentView = 'allTickets';
  localStorage.setItem('currentView', 'allTickets');
  renderView();
}

function showOpenTickets(event) {
  event.preventDefault();
  currentView = 'openTickets';
  localStorage.setItem('currentView', 'openTickets');
  renderView();
}

function showClosedTickets(event) {
  event.preventDefault();
  currentView = 'closedTickets';
  localStorage.setItem('currentView', 'closedTickets');
  renderView();
}

function showIntegrations(event) {
  event.preventDefault();
  currentView = 'integrations';
  localStorage.setItem('currentView', 'integrations');
  renderView();
}

function showBotSettings(event) {
  event.preventDefault();
  currentView = 'botSetup';
  localStorage.setItem('currentView', 'botSetup');
  renderView();
}

function showFormSetup(event) {
  event.preventDefault();
  currentView = 'formSetup';
  localStorage.setItem('currentView', 'formSetup');
  fetchFormQuestions();
}

function goBackToDashboard() {
  currentView = 'dashboard';
  localStorage.setItem('currentView', 'dashboard');
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

function onLoggingChannelSelectChange(select) {
  selectedLoggingChannelId = select.value;
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
  if (!selectedChannelId) {
    showDeployMessage('Please select a channel before deploying.', false);
    return;
  }
  if (!embedTitle || !embedDescription || !embedButtonLabel || !embedColor) {
    showDeployMessage('Please fill in all embed fields.', false);
    return;
  }
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

function disconnectDiscord() {
  manualDisconnect = true;
  discordConnected = false;
  connectedServer = '';
  connectedGuildId = '';
  availableChannels = [];
  availableCategories = [];
  tickets = [];
  embedTitle = 'Support Ticket System';
  embedDescription = 'Click the button below to create a new support ticket.';
  embedButtonLabel = 'Create Ticket';
  embedColor = '#5865F2';
  selectedChannelId = '';
  selectedCategoryId = '';
  selectedLoggingChannelId = '';
  localStorage.removeItem('embedTitle');
  localStorage.removeItem('embedDescription');
  localStorage.removeItem('embedButtonLabel');
  localStorage.removeItem('embedColor');
  localStorage.removeItem('selectedChannelId');
  localStorage.removeItem('selectedCategoryId');
  if (ws) {
    ws.close();
    ws = null;
  }
  stopPolling();
  renderView();
}

// --- TICKET LIVE VIEW ---
window.openTicketLiveView = async function(ticketNumber, guildId) {
  currentTicketLiveView = ticketNumber;
  const ticket = tickets.find(t => t.ticketNumber === ticketNumber && t.guildId === guildId);
  if (!ticket) {
    alert('Ticket not found.');
    return;
  }
  const messages = ticketMessages[ticketNumber] || [];
  try {
    const liveViewHtml = await renderTicketLiveView(
      ticketNumber,
      messages,
      () => {
        currentTicketLiveView = null;
        renderView();
      },
      ticket.formResponses,
      ticket.userId,
      {
        guildId: ticket.guildId,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt,
        lastUpdated: ticket.lastUpdated,
        panelTitle: ticket.panelTitle || 'Unknown Panel'
      }
    );
    document.getElementById('mainContent').innerHTML = liveViewHtml;
  } catch (err) {
    console.error('Error rendering ticket live view:', err);
    alert('Failed to load ticket details.');
  }
};

// --- RENDERING FUNCTIONS ---
function renderLoginView() {
  return `
    <div class="min-h-screen flex items-center justify-center bg-gray-100">
      <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 class="text-2xl font-bold mb-6 text-gray-800">Login</h2>
        <div>
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="username">
              Username
            </label>
            <input class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" id="username" type="text" placeholder="Username">
          </div>
          <div class="mb-6">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="password">
              Password
            </label>
            <input class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" id="password" type="password" placeholder="******************">
          </div>
          <div class="flex items-center justify-between">
            <button onclick="goBackToDashboard()" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="button">
              Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

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
              <tr onclick="window.openTicketLiveView('${t.ticketNumber}', '${t.guildId}')" style="cursor:pointer;">
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
            <tr onclick="window.openTicketLiveView('${t.ticketNumber}', '${t.guildId}')" style="cursor:pointer;">
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
            <tr onclick="window.openTicketLiveView('${t.ticketNumber}', '${t.guildId}')" style="cursor:pointer;">
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
            <tr onclick="window.openTicketLiveView('${t.ticketNumber}', '${t.guildId}')" style="cursor:pointer;">
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
                <label class="text-sm">Required</label>
              </div>
              <div class="col-span-2 flex items-center space-x-2">
                <input type="checkbox" ${q.multiline ? 'checked' : ''} onchange="window.updateFormQuestion(${index}, 'multiline', this.checked)" />
                <label class="text-sm">Multi-line</label>
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

function renderMainContent() {
  if (currentTicketLiveView) {
    return ''; // Ticket live view is handled separately
  }
  switch (currentView) {
    case 'login':
      return renderLoginView();
    case 'dashboard':
      return renderDashboardContent();
    case 'ticketDashboard':
      return renderDashboardContent();
    case 'allTickets':
      return renderAllTicketsContent();
    case 'openTickets':
      return renderOpenTicketsContent();
    case 'closedTickets':
      return renderClosedTicketsContent();
    case 'integrations':
      return renderIntegrationsContent();
    case 'botSetup':
      return renderBotSetup();
    case 'formSetup':
      return renderFormSetupView();
    case 'settingsDashboard':
      return renderSettingsDashboardContent();
    default:
      return renderDashboardContent();
  }
}

function renderSidebar() {
  return `
    <div class="w-64 bg-gray-800 text-white h-screen flex flex-col">
      <div class="p-4 border-b border-gray-700">
        <h2 class="text-xl font-bold">Dashboard</h2>
      </div>
      <nav class="flex-1">
        <ul>
          <li class="border-b border-gray-700">
            <a href="#" onclick="showTicketsOptions(event)" class="block py-2 px-4 hover:bg-gray-700 ${currentSidebarContent === 'tickets' ? 'bg-gray-700' : ''}">
              Tickets
            </a>
            ${currentSidebarContent === 'tickets' && isCollapsibleOpen ? `
              <ul class="pl-4">
                <li><a href="#" onclick="showTicketDashboard(event)" class="block py-2 px-4 hover:bg-gray-600 text-sm ${currentView === 'ticketDashboard' ? 'bg-gray-600' : ''}">Ticket Dashboard</a></li>
                <li><a href="#" onclick="showAllTickets(event)" class="block py-2 px-4 hover:bg-gray-600 text-sm ${currentView === 'allTickets' ? 'bg-gray-600' : ''}">All Tickets</a></li>
                <li><a href="#" onclick="showOpenTickets(event)" class="block py-2 px-4 hover:bg-gray-600 text-sm ${currentView === 'openTickets' ? 'bg-gray-600' : ''}">Active Tickets</a></li>
                <li><a href="#" onclick="showClosedTickets(event)" class="block py-2 px-4 hover:bg-gray-600 text-sm ${currentView === 'closedTickets' ? 'bg-gray-600' : ''}">Resolved Tickets</a></li>
              </ul>
            ` : ''}
          </li>
          <li class="border-b border-gray-700">
            <a href="#" onclick="showSettingsOptions(event)" class="block py-2 px-4 hover:bg-gray-700 ${currentSidebarContent === 'settings' ? 'bg-gray-700' : ''}">
              Settings
            </a>
            ${currentSidebarContent === 'settings' && isCollapsibleOpen ? `
              <ul class="pl-4">
                <li><a href="#" onclick="showIntegrations(event)" class="block py-2 px-4 hover:bg-gray-600 text-sm ${currentView === 'integrations' ? 'bg-gray-600' : ''}">Integrations</a></li>
                <li><a href="#" onclick="showBotSettings(event)" class="block py-2 px-4 hover:bg-gray-600 text-sm ${currentView === 'botSetup' ? 'bg-gray-600' : ''}">Bot Setup</a></li>
                <li><a href="#" onclick="showFormSetup(event)" class="block py-2 px-4 hover:bg-gray-600 text-sm ${currentView === 'formSetup' ? 'bg-gray-600' : ''}">Form Setup</a></li>
              </ul>
            ` : ''}
          </li>
        </ul>
      </nav>
      <div class="p-4 border-t border-gray-700">
        <button onclick="logout()" class="w-full text-left py-2 px-4 hover:bg-gray-700 rounded">
          Logout
        </button>
      </div>
    </div>
  `;
}

function renderView() {
  if (currentTicketLiveView) {
    return; // Ticket live view is already rendered
  }
  const app = document.getElementById('app');
  if (!app) {
    console.error('App container not found');
    return;
  }
  app.innerHTML = `
    <div class="flex h-screen">
      ${renderSidebar()}
      <div class="flex-1 p-6 overflow-auto" id="mainContent">
        ${renderMainContent()}
      </div>
    </div>
  `;
}

// --- POLLING ---
function startPolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(() => {
    if (connectedGuildId) {
      fetchTickets(connectedGuildId);
    }
  }, 60000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  setupWebSocket();
  startPolling();
  if (currentView !== 'login') {
    if (connectedGuildId) {
      fetchChannelsForGuild(connectedGuildId);
      fetchTickets(connectedGuildId);
    }
    fetchFormQuestions();
  }
  renderView();
});