let userTicketCache = {};

function loadCache() {
  try {
    const cached = localStorage.getItem('userTicketCache');
    if (cached) {
      userTicketCache = JSON.parse(cached);
    }
  } catch (error) {
    console.error('Error loading user ticket cache:', error);
    userTicketCache = {};
  }
}

function saveCache() {
  try {
    localStorage.setItem('userTicketCache', JSON.stringify(userTicketCache));
  } catch (error) {
    console.error('Error saving user ticket cache:', error);
  }
}

export function addOrUpdateUserTicket(userId, ticket) {
  if (!userTicketCache[userId]) {
    userTicketCache[userId] = [];
  }
  const existingIndex = userTicketCache[userId].findIndex(t => t.ticketNumber === ticket.ticketNumber && t.guildId === ticket.guildId);
  if (existingIndex !== -1) {
    userTicketCache[userId][existingIndex] = { ...ticket };
  } else {
    userTicketCache[userId].push(ticket);
  }
  saveCache();
}

export function getUserTickets(userId) {
  return userTicketCache[userId] || [];
}

export function updateUserTickets(userId, tickets) {
  userTicketCache[userId] = tickets;
  saveCache();
}

// Initialize cache on load
loadCache();