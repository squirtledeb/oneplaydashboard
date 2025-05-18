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

// Initialize Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Update the deploy-embed endpoint with better error handling
app.post('/api/deploy-embed', async (req, res) => {
  try {
    const { channelId, title, description, buttonLabel, color } = req.body;
    
    if (!channelId || !title || !description || !buttonLabel) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        success: false
      });
    }

    console.log('Attempting to deploy embed to channel:', channelId);
    
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error('Channel not found:', channelId);
      return res.status(404).json({ 
        error: 'Channel not found',
        success: false
      });
    }

    // Verify bot has permission to send messages in this channel
    const permissions = channel.permissionsFor(client.user);
    if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
      console.error('Bot lacks required permissions for channel:', channelId);
      return res.status(403).json({ 
        error: 'Bot lacks required permissions in this channel',
        success: false
      });
    }

    // Create the embed with proper error handling for the color
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color || '#5865F2')
      .setTimestamp();
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket')
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
      );
    
    console.log('Sending embed to channel...');
    const message = await channel.send({ embeds: [embed], components: [row] });
    
    // Store this channel as a ticket channel
    const guildId = channel.guild.id;
    if (!ticketChannels[guildId]) {
      ticketChannels[guildId] = [];
    }
    ticketChannels[guildId].push(channelId);
    
    console.log('Embed deployed successfully to channel:', channelId);
    res.json({ 
      success: true,
      messageId: message.id,
      channelId: channel.id
    });
  } catch (error) {
    console.error('Error deploying embed:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to deploy embed',
      success: false
    });
  }
});

// Bot state management
let connectedGuilds = [];
let ticketChannels = {};
let activeTickets = {};

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
      .setColor(color)
      .setTimestamp();
    
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

// Handle button interactions for ticket creation
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  // Handle ticket creation button
  if (interaction.customId === 'create_ticket') {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    
    // Check if user already has an open ticket
    if (activeTickets[guildId] && activeTickets[guildId][userId]) {
      return interaction.reply({
        content: `You already have an open ticket. Please use that one.`,
        ephemeral: true
      });
    }
    
    try {
      // Create a new ticket channel
      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: 0, // Text channel
        permissionOverwrites: [
          {
            id: interaction.guild.id, // @everyone role
            deny: ['ViewChannel']
          },
          {
            id: userId, // Ticket creator
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          },
          {
            id: client.user.id, // Bot
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });
      
      // Store the active ticket
      if (!activeTickets[guildId]) activeTickets[guildId] = {};
      activeTickets[guildId][userId] = {
        channelId: channel.id,
        createdAt: new Date(),
        status: 'active'
      };
      
      // Send initial message in the ticket channel
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
      
      // Notify the user that the ticket was created
      return interaction.reply({
        content: `Your ticket has been created: <#${channel.id}>`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error creating ticket:', error);
      return interaction.reply({
        content: 'There was an error creating your ticket. Please try again later.',
        ephemeral: true
      });
    }
  }
  
  // Handle ticket closing button
  if (interaction.customId === 'close_ticket') {
    try {
      const guildId = interaction.guild.id;
      const channelId = interaction.channel.id;
      
      // Find the user who owns this ticket
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
        // Update the ticket status
        activeTickets[guildId][ticketOwnerUserId].status = 'closed';
        
        // Send a message indicating the ticket is closed
        await interaction.reply({
          content: 'This ticket has been closed. The channel will be deleted in 5 seconds...',
        });
        
        // Wait 5 seconds before deleting the channel
        setTimeout(async () => {
          try {
            await interaction.channel.delete();
            // You might want to create a log of this ticket somewhere
            delete activeTickets[guildId][ticketOwnerUserId];
          } catch (err) {
            console.error('Error deleting channel:', err);
          }
        }, 5000);
      } else {
        await interaction.reply({
          content: 'Unable to find ticket information. Please close it manually.',
        });
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      await interaction.reply({
        content: 'There was an error closing this ticket.',
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
