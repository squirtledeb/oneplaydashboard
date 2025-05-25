// frontend/ticketLiveView.js
// This module handles rendering and logic for the live ticket view

function renderTicketLiveView(ticketNumber, messages, closeCallback) {
  return `
    <div>
      <h1 class="text-2xl font-bold mb-4">Live View - Ticket #${ticketNumber}</h1>
      <button onclick="${closeCallback}" class="mb-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Back to Tickets</button>
      <div id="liveMessages" class="border rounded p-4 h-96 overflow-auto bg-white">
        ${messages.length === 0 ? '<p>No messages yet.</p>' : messages.map(msg => `
          <div class="mb-2 p-2 border-b border-gray-200">
            <div class="text-xs font-semibold text-indigo-600">${msg.sender || 'Unknown'}</div>
            <div class="text-sm text-gray-600">${new Date(msg.timestamp).toLocaleString()}</div>
            <div class="text-gray-800">${msg.content}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

window.renderTicketLiveView = renderTicketLiveView;