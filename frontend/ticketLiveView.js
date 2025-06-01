// frontend/ticketLiveView.js
// This module handles rendering and logic for the live ticket view

function renderTicketLiveView(ticketNumber, messages, closeCallback, formResponses = null) {
  return `
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Live View - Ticket #${ticketNumber}</h1>
        <button onclick="${closeCallback}" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Back to Tickets</button>
      </div>
      <div class="flex space-x-6">
          <div id="liveMessages" class="flex-1 border rounded p-4 overflow-auto bg-white" style="min-height: calc(100vh - 150px);">
          ${messages.length === 0 ? '<p>No messages yet.</p>' : messages.map(msg => `
            <div class="mb-2 p-2 border-b border-gray-200">
              <div class="text-xs font-semibold text-indigo-600">${msg.sender || 'Unknown'}</div>
              <div class="text-sm text-gray-600">${new Date(msg.timestamp).toLocaleString()}</div>
              <div class="text-gray-800">${msg.content}</div>
            </div>
          `).join('')}
        </div>
${formResponses ? `
          <div class="w-1/3 mb-6 border rounded-lg p-4 bg-blue-50 text-sm text-gray-700">
            <h2 class="text-lg font-semibold mb-3 text-blue-800">Form Responses</h2>
            <div class="space-y-2">
              ${Object.entries(formResponses).map(([questionId, response]) => {
                return `
                  <div class="bg-white p-3 rounded border">
                    <div class="text-gray-600 mt-1">${response || 'No response'}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

window.renderTicketLiveView = renderTicketLiveView;