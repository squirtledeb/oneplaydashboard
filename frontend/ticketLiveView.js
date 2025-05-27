// frontend/ticketLiveView.js
// This module handles rendering and logic for the live ticket view

function renderTicketLiveView(ticketNumber, messages, closeCallback, formResponses = null) {
  return `
    <div>
      <h1 class="text-2xl font-bold mb-4">Live View - Ticket #${ticketNumber}</h1>
      <button onclick="${closeCallback}" class="mb-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Back to Tickets</button>
      
      ${formResponses ? `
        <div class="mb-6 border rounded-lg p-4 bg-blue-50">
          <h2 class="text-lg font-semibold mb-3 text-blue-800">Form Responses</h2>
          <div class="space-y-2">
            ${Object.entries(formResponses).map(([questionId, response]) => {
              // Find the question text from formQuestions array
              const question = window.formQuestions?.find(q => q.id === questionId);
              const questionText = question ? question.question : questionId;
              return `
                <div class="bg-white p-3 rounded border">
                  <div class="font-medium text-gray-700">${questionText}</div>
                  <div class="text-gray-600 mt-1">${response || 'No response'}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
      
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