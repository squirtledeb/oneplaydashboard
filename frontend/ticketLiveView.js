const { getUserTickets, addOrUpdateUserTicket } = require('./userTicketHistory.js');

const API_BASE = 'http://localhost:4000';

async function renderTicketLiveView(ticketNumber, messages, onClose, formResponses, userId, currentTicket) {
  try {
    // Fetch form questions to map responses
    const formQuestionsResponse = await fetch(`${API_BASE}/api/form-questions`);
    const formQuestions = await formQuestionsResponse.json();

    // Fetch user tickets and merge with current ticket
    const userTickets = await fetchUserTickets(userId, currentTicket);

    // Format form responses
    const formattedResponses = formQuestions.map(q => ({
      question: q.question,
      response: formResponses && formResponses[q.id] ? formResponses[q.id] : 'No response'
    }));

    // Format messages
    const formattedMessages = messages.map(msg => ({
      timestamp: new Date(msg.timestamp).toLocaleString(),
      sender: msg.sender,
      content: msg.content
    }));

    // Format user tickets
    const formattedUserTickets = userTickets.map(ticket => ({
      ticketNumber: ticket.ticketNumber,
      status: ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1),
      createdAt: new Date(ticket.createdAt).toLocaleString(),
      panelTitle: ticket.panelTitle
    }));

    return `
      <div class="p-6">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-2xl font-bold text-gray-800">Ticket #${ticketNumber}</h1>
          <button onclick="(${onClose.toString()})()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
            Close View
          </button>
        </div>

        <!-- Ticket Messages -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-gray-800">Messages</h2>
          <div class="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
            ${formattedMessages.length === 0 ?
              '<p class="text-gray-500">No messages yet.</p>' :
              formattedMessages.map(msg => `
                <div class="mb-4">
                  <div class="flex justify-between items-center">
                    <span class="font-semibold ${msg.sender === 'AI Bot' ? 'text-blue-600' : 'text-gray-800'}">${msg.sender}</span>
                    <span class="text-sm text-gray-500">${msg.timestamp}</span>
                  </div>
                  <p class="text-gray-700 mt-1">${msg.content}</p>
                </div>
              `).join('')}
          </div>
        </div>

        <!-- Form Responses -->
        <div class="mb-8">
          <h2 class="text-xl font-semibold mb-4 text-gray-800">Form Responses</h2>
          <div class="border rounded-lg p-4 bg-gray-50">
            ${formattedResponses.length === 0 ?
              '<p class="text-gray-500">No form responses available.</p>' :
              formattedResponses.map(resp => `
                <div class="mb-4">
                  <h3 class="font-semibold text-gray-800">${resp.question}</h3>
                  <p class="text-gray-700">${resp.response}</p>
                </div>
              `).join('')}
          </div>
        </div>

        <!-- User Ticket History -->
        <div>
          <h2 class="text-xl font-semibold mb-4 text-gray-800">User Ticket History</h2>
          <div class="border rounded-lg overflow-hidden">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Panel</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                ${formattedUserTickets.length === 0 ?
                  '<tr><td colspan="4" class="px-6 py-4 text-gray-500">No ticket history available.</td></tr>' :
                  formattedUserTickets.map(ticket => `
                    <tr>
                      <td class="px-6 py-4 whitespace-nowrap">#${ticket.ticketNumber}</td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ticket.status === 'Active' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">${ticket.status}</span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">${ticket.createdAt}</td>
                      <td class="px-6 py-4 whitespace-nowrap">${ticket.panelTitle}</td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error rendering ticket live view:', error);
    return `
      <div class="p-6">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Error</h1>
        <p class="text-red-600">Failed to load ticket details: ${error.message}</p>
        <button onclick="(${onClose.toString()})()" class="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
          Close View
        </button>
      </div>
    `;
  }
}

async function fetchUserTickets(userId, currentTicket) {
  try {
    // Fetch user tickets from the API
    const response = await fetch(`${API_BASE}/api/user-tickets/${userId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user tickets');
    }
    let userTickets = await response.json();

    // Add or update the current ticket in the cache
    if (currentTicket) {
      addOrUpdateUserTicket(userId, currentTicket);
    }

    // Merge current ticket with fetched tickets
    const cachedTickets = getUserTickets(userId);
    const ticketMap = new Map(cachedTickets.map(t => [t.ticketNumber, t]));

    // Include all fetched tickets, updating with current ticket if present
    userTickets.forEach(ticket => {
      ticketMap.set(ticket.ticketNumber, {
        ...ticketMap.get(ticket.ticketNumber) || {},
        ...ticket
      });
    });

    // Convert map to array and sort by createdAt descending
    const mergedTickets = Array.from(ticketMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return mergedTickets;
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    // Return cached tickets if available
    const cachedTickets = getUserTickets(userId);
    if (currentTicket && !cachedTickets.some(t => t.ticketNumber === currentTicket.ticketNumber)) {
      cachedTickets.push(currentTicket);
      cachedTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return cachedTickets;
  }
}

module.exports = { renderTicketLiveView };