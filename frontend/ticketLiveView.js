// frontend/ticketLiveView.js
// This module handles rendering and logic for the live ticket view

function renderTicketLiveView(ticketNumber, messages, closeCallback, formResponses = null, userTicketHistory = []) {
  return `
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Live View - Ticket #${ticketNumber}</h1>
        <button onclick="${closeCallback}" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Back to Tickets</button>
      </div>
      <div class="flex items-stretch space-x-6">
        <div id="liveMessages" class="flex-1 border rounded p-4 overflow-auto bg-white flex flex-col">
          ${messages.length === 0 ? '<p>No messages yet.</p>' : messages.map(msg => `
            <div class="mb-2 p-2 border-b border-gray-200">
              <div class="text-xs font-semibold text-indigo-600">${msg.sender || 'Unknown'}</div>
              <div class="text-sm text-gray-600">${new Date(msg.timestamp).toLocaleString()}</div>
              <div class="text-gray-800">${msg.content}</div>
            </div>
          `).join('')}
        </div>
        <div class="w-1/3 border rounded-lg p-4 bg-blue-50 text-sm text-gray-700 overflow-auto flex flex-col">
            ${formResponses ? `
            <h2 class="text-lg font-semibold mb-3 text-blue-800">Form Responses</h2>
            <div class="space-y-2 mb-6">
              ${Object.entries(formResponses).map(([questionId, response]) => {
                return `
                  <div class="bg-white p-3 rounded border">
                    <div class="text-gray-600 mt-1">${response || 'No response'}</div>
                  </div>
                `;
              }).join('')}
            </div>
            ` : ''}
            <h2 class="text-lg font-semibold mb-3 text-blue-800">User Ticket History</h2>
          <div class="space-y-2 overflow-y-auto" style="height: 320px;">
            ${userTicketHistory.length > 0 ? userTicketHistory.map(ticket => `
                <div class="bg-white p-3 rounded border flex justify-between items-center cursor-pointer hover:bg-gray-100" onclick="window.openTicketLiveView('${ticket.ticketNumber}')">
                  <div>
                    <div class="font-semibold">Ticket #${ticket.ticketNumber}</div>
                    <div class="text-xs text-gray-500">${new Date(ticket.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <span class="px-2 py-1 rounded text-xs font-semibold ${ticket.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                      ${ticket.status === 'active' ? 'Active' : 'Resolved'}
                    </span>
                  </div>
                </div>
            `).join('') : '<div class="text-gray-500">No ticket history for user.</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

window.renderTicketLiveView = renderTicketLiveView;