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
  if (client.isReady()) {
    const guilds = client.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name
    }));
    ws.send(JSON.stringify({
      type: 'GUILD_STATUS',
      guilds
    }));
  }
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'GET_GUILD_STATUS') {
        if (client.isReady()) {
          const guilds = client.guilds.cache.map(guild => ({
            id: guild.id,
            name: guild.name
          }));
          ws.send(JSON.stringify({
            type: 'GUILD_STATUS',
            guilds
          }));
        }
      } else if (data.type === 'TICKET_MESSAGE') {
        // Handle incoming ticket message
        const { guildId, ticketNumber, message: ticketMessage } = data;
        if (!activeTickets[guildId]) activeTickets[guildId] = {};
        if (!activeTickets[guildId][ticketNumber]) activeTickets[guildId][ticketNumber] = {};
        if (!activeTickets[guildId][ticketNumber].messages) activeTickets[guildId][ticketNumber].messages = [];
        // Ensure message has timestamp and content
        const msgToStore = {
          timestamp: ticketMessage.timestamp || new Date().toISOString(),
          content: ticketMessage.content || ticketMessage.text || JSON.stringify(ticketMessage)
        };
        activeTickets[guildId][ticketNumber].messages.push(msgToStore);
        // Broadcast to all clients
        broadcastUpdate({
          type: 'TICKET_MESSAGE',
          ticketNumber,
          message: msgToStore
        });
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });
  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Function to broadcast updates to all connected clients
function broadcastUpdate(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Initialize Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Bot state management
let connectedGuilds = [];
let ticketChannels = {};
let activeTickets = {};
let ticketCounters = {}; // { guildId: nextTicketNumber }

// Discord bot token from environment variable
const TOKEN = process.env.DISCORD_BOT_TOKEN;

// Set up API endpoints
app.get('/api/guilds', (req, res) => {
  if (!client.isReady()) {
    return res.status(503).json({ error: 'Bot is not ready' });
  }
  const guilds = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name
  }));
  res.json(guilds);
});

app.get('/api/channels/:guildId', (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }
  const channels = guild.channels.cache
    .filter(channel => channel.type === 0)
    .map(channel => ({
      id: channel.id,
      name: channel.name
    }));
  res.json(channels);
});

// New endpoint to get categories for a guild
app.get('/api/categories/:guildId', (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }
  const categories = guild.channels.cache
    .filter(channel => channel.type === 4)
    .map(category => ({
      id: category.id,
      name: category.name
    }));
  res.json(categories);
});

app.get('/api/tickets/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const tickets = [];
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }
  if (activeTickets[guildId]) {
    for (const ticketNumber in activeTickets[guildId]) {
      const ticket = activeTickets[guildId][ticketNumber];
      // Try to get member from cache or fetch from API
      let member = guild.members.cache.get(ticket.userId);
      if (!member) {
        try {
          member = await guild.members.fetch(ticket.userId);
        } catch (e) {
          member = null;
        }
      }
      const username = member ? member.user.username : 'Unknown';
      tickets.push({
        ...ticket,
        username
      });
    }
  }
  res.json(tickets);
});

// New endpoint to get messages for a ticket
app.get('/api/ticket-messages/:ticketNumber', (req, res) => {
  const { ticketNumber } = req.params;
  // Find messages for the ticketNumber in activeTickets or elsewhere
  let messages = [];
  for (const guildId in activeTickets) {
    if (activeTickets[guildId][ticketNumber]) {
      // For simplicity, assume messages are stored in activeTickets[guildId][ticketNumber].messages
      messages = activeTickets[guildId][ticketNumber].messages || [];
      break;
    }
  }
  res.json(messages);
});

app.post('/api/deploy-embed', async (req, res) => {
  try {
    const { channelId, title, description, buttonLabel, color, parentCategoryId } = req.body;
    if (!channelId || !title || !description || !buttonLabel) {
      return res.status(400).json({ error: 'Missing required fields', success: false });
    }
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found', success: false });
    }
    const permissions = channel.permissionsFor(client.user);
    if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
      return res.status(403).json({ error: 'Bot lacks required permissions in this channel', success: false });
    }
    // Remove timestamp from embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color || '#5865F2');
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`create_ticket:${parentCategoryId || ''}`)
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
      );
    const message = await channel.send({ embeds: [embed], components: [row] });
    const guildId = channel.guild.id;
    if (!ticketChannels[guildId]) {
      ticketChannels[guildId] = [];
    }
    ticketChannels[guildId].push(channelId);
    res.json({ success: true, messageId: message.id, channelId: channel.id });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to deploy embed', success: false });
  }
});

// Bot startup
client.once('ready', () => {
  connectedGuilds = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name
  }));
  broadcastUpdate({
    type: 'GUILD_UPDATE',
    guilds: connectedGuilds
  });

  // Listen for new messages in ticket channels for live updates
  client.on('messageCreate', async (message) => {
    try {
      console.log('Received messageCreate event:', message.content);
      if (message.author.bot) return; // Ignore bot messages
      const guildId = message.guild.id;
      // Find ticketNumber by channelId
      let ticketNumber = null;
      if (activeTickets[guildId]) {
        for (const tNum in activeTickets[guildId]) {
          if (activeTickets[guildId][tNum].channelId === message.channel.id) {
            ticketNumber = tNum;
            break;
          }
        }
      }
      if (!ticketNumber) return; // Not a ticket channel
      // Prepare message object
      const ticketMessage = {
        timestamp: message.createdAt.toISOString(),
        content: message.content,
        sender: message.author.username
      };
      // Store message
      if (!activeTickets[guildId][ticketNumber].messages) {
        activeTickets[guildId][ticketNumber].messages = [];
      }
      activeTickets[guildId][ticketNumber].messages.push(ticketMessage);
      // Broadcast to clients
      broadcastUpdate({
        type: 'TICKET_MESSAGE',
        ticketNumber,
        message: ticketMessage
      });
    } catch (err) {
      console.error('Error handling messageCreate event:', err);
    }
  });
});

// Handle bot joining a new server
client.on('guildCreate', (guild) => {
  connectedGuilds.push({
    id: guild.id,
    name: guild.name
  });
  broadcastUpdate({
    type: 'GUILD_UPDATE',
    guilds: connectedGuilds
  });
});

// Handle bot leaving a server
client.on('guildDelete', (guild) => {
  connectedGuilds = connectedGuilds.filter(g => g.id !== guild.id);
  broadcastUpdate({
    type: 'GUILD_UPDATE',
    guilds: connectedGuilds
  });
});

// --- TICKET NUMBER GENERATION ---
function getNextTicketNumber(guildId) {
  if (!ticketCounters[guildId]) ticketCounters[guildId] = 1;
  let num = ticketCounters[guildId];
  ticketCounters[guildId]++;
  if (ticketCounters[guildId] > 9999) ticketCounters[guildId] = 1;
  return num.toString().padStart(4, '0');
}

// --- TICKET INTERACTIONS ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith('create_ticket')) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    if (!activeTickets[guildId]) activeTickets[guildId] = {};
    // Check if user already has an open ticket
    for (const tNum in activeTickets[guildId]) {
      if (activeTickets[guildId][tNum].userId === userId && activeTickets[guildId][tNum].status === 'active') {
return interaction.reply({
          content: `You already have an open ticket (#${tNum}). Please use that one.`,
          flags: 64
        });
      }
    }
    // Generate ticket number
    const ticketNumber = getNextTicketNumber(guildId);
    try {
      // Create a new ticket channel
      const channelOptions = {
        name: ticketNumber,
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
      };
      // Extract parentCategoryId from customId
      const parentCategoryId = interaction.customId.split(':')[1];
      if (parentCategoryId) {
        channelOptions.parent = parentCategoryId;
      }
      const channel = await interaction.guild.channels.create(channelOptions);
      // Store the active ticket
      activeTickets[guildId][ticketNumber] = {
        ticketNumber,
        userId,
        channelId: channel.id,
        createdAt: new Date(),
        status: 'active',
        lastUpdated: new Date(),
        messages: [
          {
            timestamp: new Date().toISOString(),
            content: `Hello <@${userId}>, thanks for creating a support ticket. Support team will be here to assist you shortly.`,
            sender: 'Oneplay AI'
          }
        ]
      };
      const embed = new EmbedBuilder()
        .setTitle('Support Ticket')
        .setDescription(`Hello <@${userId}>, support staff will be with you shortly.`)
        .setColor('#5865F2');
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
await interaction.reply({
        content: `Your ticket has been created: <#${channel.id}>`,
        flags: 64
      });
      setTimeout(() => {
  interaction.deleteReply().catch(() => {});
}, 5000);
return;
    } catch (error) {
return interaction.reply({
        content: 'There was an error creating your ticket. Please try again later.',
        flags: 64
      });
    }
  }
  if (interaction.customId === 'close_ticket') {
    try {
      const guildId = interaction.guild.id;
      const channelId = interaction.channel.id;
      let ticketNumber = null;
      if (activeTickets[guildId]) {
        for (const tNum in activeTickets[guildId]) {
          if (activeTickets[guildId][tNum].channelId === channelId) {
            ticketNumber = tNum;
            break;
          }
        }
      }
      if (ticketNumber) {
        activeTickets[guildId][ticketNumber].status = 'closed';
        activeTickets[guildId][ticketNumber].lastUpdated = new Date();
await interaction.reply({
          content: 'This ticket has been closed. The channel will be deleted in 5 seconds...',
          flags: 64
        });
        setTimeout(async () => {
          try {
            await interaction.channel.delete();
          } catch (err) {}
        }, 5000);
      } else {
await interaction.reply({
          content: 'Unable to find ticket information. Please close it manually.',
          flags: 64
        });
      }
    } catch (error) {
      await interaction.reply({
        content: 'There was an error closing this ticket.',
      });
    }
  }
});

// Start the Express server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

// Login to Discord with your client's token
client.login(TOKEN).catch(error => {
  console.error('Error logging in to Discord:', error);
});