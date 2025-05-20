const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
require('dotenv').config();

// Initialize Express server
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: 4001 });

// Keep track of connected clients
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws) => {
  clients.add(ws);
  
  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Function to broadcast updates to all connected clients
function broadcastUpdate(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Function to get tickets with user names
const getTicketsWithUserNames = () => {
  const ticketsWithUserNames = {};
  for (const guildId in activeTickets) {
    ticketsWithUserNames[guildId] = {};
    const guild = client.guilds.cache.get(guildId);
    for (const userId in activeTickets[guildId]) {
      const ticket = activeTickets[guildId][userId];
      let userName = 'Unknown';
      let ticketNumber = 'Unknown';
      if (guild) {
        const member = guild.members.cache.get(userId);
        if (member) {
          userName = member.user.username;
        }
        try {
          const channel = guild.channels.cache.get(ticket.channelId);
          if (channel) {
            const match = channel.name.match(/^ticket-(\d{4})$/);
            if (match) {
              ticketNumber = match[1];
            }
          }
        } catch (err) {
          console.error('Error fetching channel for ticket number:', err);
        }
      }
      ticketsWithUserNames[guildId][userId] = {
        ...ticket,
        userName,
        ticketNumber
      };
    }
  }
  return ticketsWithUserNames;
};

// Listen for new messages in ticket channels to update last updated timestamp
client.on('messageCreate', async (message) => {
  if (message.author.bot) return; // Ignore bot messages
  const guildId = message.guild?.id;
  if (!guildId) return;
  const userId = message.author.id;
  if (!activeTickets[guildId]) return;
  // Find if the message channel is an active ticket channel
  for (const uid in activeTickets[guildId]) {
    const ticket = activeTickets[guildId][uid];
    if (ticket.channelId === message.channel.id) {
      // Update last updated timestamp
      ticket.createdAt = new Date();
      saveData();
      // Broadcast updated tickets to clients
      broadcastUpdate({
        type: 'TICKET_UPDATE',
        tickets: getTicketsWithUserNames()
      });
      break;
    }
  }
});

const fs = require('fs');
const path = require('path');

// Bot state management
let connectedGuilds = [];
let ticketChannels = {};
let activeTickets = {};

// File paths for persistence
const DATA_DIR = path.join(__dirname, 'data');
const TICKET_CHANNELS_FILE = path.join(DATA_DIR, 'ticketChannels.json');
const ACTIVE_TICKETS_FILE = path.join(DATA_DIR, 'activeTickets.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Load persisted data
function loadData() {
  try {
    if (fs.existsSync(TICKET_CHANNELS_FILE)) {
      const data = fs.readFileSync(TICKET_CHANNELS_FILE, 'utf-8').trim();
      if (data) {
        ticketChannels = JSON.parse(data);
      } else {
        ticketChannels = {};
      }
    }
  } catch (err) {
    console.error('Error loading ticketChannels:', err);
    ticketChannels = {};
  }
  try {
    if (fs.existsSync(ACTIVE_TICKETS_FILE)) {
      const data = fs.readFileSync(ACTIVE_TICKETS_FILE, 'utf-8').trim();
      if (data) {
        activeTickets = JSON.parse(data);
      } else {
        activeTickets = {};
      }
    }
  } catch (err) {
    console.error('Error loading activeTickets:', err);
    activeTickets = {};
  }
}

// Save data to files
function saveData() {
  try {
    fs.writeFileSync(TICKET_CHANNELS_FILE, JSON.stringify(ticketChannels, null, 2));
  } catch (err) {
    console.error('Error saving ticketChannels:', err);
  }
  try {
    fs.writeFileSync(ACTIVE_TICKETS_FILE, JSON.stringify(activeTickets, null, 2));
  } catch (err) {
    console.error('Error saving activeTickets:', err);
  }
}

  
// Load data on startup
loadData();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  await refreshTicketChannels();
});

// Function to validate and refresh ticketChannels on startup
async function refreshTicketChannels() {
  for (const guildId in ticketChannels) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.log(`Guild ${guildId} not found in cache, removing from ticketChannels`);
      delete ticketChannels[guildId];
      continue;
    }
    const validChannels = [];
    for (const channelId of ticketChannels[guildId]) {
      try {
        const channel = await guild.channels.fetch(channelId);
        if (channel) {
          validChannels.push(channelId);
        }
      } catch (err) {
        console.log(`Channel ${channelId} not found in guild ${guildId}, removing from ticketChannels`);
      }
    }
    ticketChannels[guildId] = validChannels;
  }
  saveData();
}

// Discord bot token from environment variable
const TOKEN = process.env.DISCORD_BOT_TOKEN;

// Set up API endpoints
// Always refresh connectedGuilds to reflect current state
app.get('/api/guilds', (req, res) => {
  connectedGuilds = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name
  }));
  console.log('[API] /api/guilds called. Current guilds:', connectedGuilds.map(g => g.name).join(', '));
  console.log('[API] /api/guilds raw guild cache:', client.guilds.cache.map(g => g.name));
  res.json(connectedGuilds);
});

app.get('/api/channels/:guildId', (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  
  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }
  
  const channels = guild.channels.cache
    .filter(channel => channel.type === 0) // Text channels only
    .map(channel => ({
      id: channel.id,
      name: channel.name
    }));
  
  res.json(channels);
});

app.post('/api/deploy-embed', async (req, res) => {
  try {
    const { channelId, title, description, buttonLabel, color } = req.body;
    
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color);
      // Removed timestamp as per request
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
      );
    
    await channel.send({ embeds: [embed], components: [row] });
    
// Store this channel as a ticket channel
const guildId = channel.guild.id;
if (!ticketChannels[guildId]) {
  ticketChannels[guildId] = [];
}
ticketChannels[guildId].push(channelId);
saveData();

res.json({ success: true });
  } catch (error) {
    console.error('Error deploying embed:', error);
    res.status(500).json({ error: 'Failed to deploy embed' });
  }
});

app.get('/api/tickets', (req, res) => {
  // Transform the activeTickets object into an array for easier consumption
  const tickets = [];
  
  for (const guildId in activeTickets) {
    for (const userId in activeTickets[guildId]) {
      const ticket = activeTickets[guildId][userId];
      tickets.push({
        guildId,
        userId,
        channelId: ticket.channelId,
        createdAt: ticket.createdAt,
        status: ticket.status
      });
    }
  }
  
  res.json(tickets);
});

// Bot startup
client.once('ready', () => {
  console.log(`Bot is online! Logged in as ${client.user.tag}`);
  
  // Store connected guilds
  connectedGuilds = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name
  }));
  
  console.log(`Connected to ${connectedGuilds.length} servers`);
});

// Handle bot joining a new server
client.on('guildCreate', (guild) => {
  console.log(`Joined a new guild: ${guild.name} (${guild.id})`);
  
  // Add to our connected guilds list
  connectedGuilds.push({
    id: guild.id,
    name: guild.name
  });

  // Broadcast the update to all connected clients
  broadcastUpdate({
    type: 'GUILD_UPDATE',
    guilds: connectedGuilds
  });
});

function generateUniqueTicketNumber(guild) {
  const existingNumbers = new Set();
  guild.channels.cache.forEach(channel => {
    const match = channel.name.match(/^ticket-(\d{4})$/);
    if (match) {
      existingNumbers.add(match[1]);
    }
  });

  for (let i = 0; i <= 9999; i++) {
    const numberStr = i.toString().padStart(4, '0');
    if (!existingNumbers.has(numberStr)) {
      return numberStr;
    }
  }
  throw new Error('No available ticket numbers');
}

// Removed duplicate function declaration to fix redeclaration error

// Handle button interactions for ticket creation and closing
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'create_ticket') {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (activeTickets[guildId] && activeTickets[guildId][userId]) {
      return interaction.reply({
        content: `You already have an open ticket. Please use that one.`,
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true }); // Acknowledge interaction early

      const ticketNumber = generateUniqueTicketNumber(interaction.guild);
      const channel = await interaction.guild.channels.create({
        name: `ticket-${ticketNumber}`,
        type: 0,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: ['ViewChannel']
          },
          {
            id: userId,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          },
          {
            id: client.user.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });

      if (!activeTickets[guildId]) activeTickets[guildId] = {};
      activeTickets[guildId][userId] = {
        channelId: channel.id,
        createdAt: new Date(),
        status: 'active'
      };
      saveData();

      broadcastUpdate({
        type: 'TICKET_UPDATE',
        tickets: getTicketsWithUserNames()
      });

      const embed = new EmbedBuilder()
        .setTitle('Support Ticket')
        .setDescription(`Hello ${interaction.user}, support staff will be with you shortly.`)
        .setColor('#5865F2')
        .setTimestamp();

      const closeButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        embeds: [embed],
        components: [closeButton]
      });

      return interaction.editReply({
        content: `Your ticket has been created: <#${channel.id}>`
      });
    } catch (error) {
      console.error('Error creating ticket:', error);
      return interaction.editReply({
        content: 'There was an error creating your ticket. Please try again later.'
      });
    }
  }

  if (interaction.customId === 'close_ticket') {
    try {
      const guildId = interaction.guild.id;
      const channelId = interaction.channel.id;

      let ticketOwnerUserId = null;
      if (activeTickets[guildId]) {
        for (const userId in activeTickets[guildId]) {
          if (activeTickets[guildId][userId].channelId === channelId) {
            ticketOwnerUserId = userId;
            break;
          }
        }
      }

      if (ticketOwnerUserId) {
        activeTickets[guildId][ticketOwnerUserId].status = 'resolved';

        broadcastUpdate({
          type: 'TICKET_UPDATE',
          tickets: getTicketsWithUserNames()
        });

        await interaction.channel.delete();

        // Do not delete the ticket immediately to allow frontend to show resolved tickets
        // delete activeTickets[guildId][ticketOwnerUserId];

        broadcastUpdate({
          type: 'TICKET_UPDATE',
          tickets: getTicketsWithUserNames()
        });
      } else {
        await interaction.reply({
          content: 'Unable to find ticket information. Please close it manually.',
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      await interaction.reply({
        content: 'There was an error closing this ticket.',
        ephemeral: true
      });
    }
  }
});

// Start the Express server
// Changed default port to 4000 to avoid conflicts
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

// Login to Discord with your client's token
client.login(TOKEN).catch(error => {
  console.error('Error logging in to Discord:', error);
});
