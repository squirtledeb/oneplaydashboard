const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
require('dotenv').config();

// Debug environment variables
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');
console.log('DISCORD_BOT_TOKEN:', process.env.DISCORD_BOT_TOKEN ? 'Set' : 'Not set');

// Load form questions
let formQuestions = [];
try {
  const formQuestionsPath = path.join(__dirname, 'formQuestions.json');
  formQuestions = JSON.parse(fs.readFileSync(formQuestionsPath, 'utf8')).questions;
} catch (error) {
  console.error('Error loading form questions:', error);
  formQuestions = [];
}

// Initialize Express server
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Form questions endpoints
app.get('/api/form-questions', (req, res) => {
  res.json(formQuestions);
});

app.post('/api/form-questions', (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'Invalid questions format' });
  }
  
  formQuestions = questions;
  const formQuestionsPath = path.join(__dirname, 'formQuestions.json');
  
  try {
    fs.writeFileSync(formQuestionsPath, JSON.stringify({ questions }, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving form questions:', error);
    res.status(500).json({ error: 'Failed to save questions' });
  }
});

// Form settings file path and default
const formSettingsPath = path.join(__dirname, 'formSettings.json');
let formSettings = { autoDisplayFormResults: false };

// Logging channel settings file path and default
const loggingChannelSettingsPath = path.join(__dirname, 'loggingChannelSettings.json');
let loggingChannelSettings = {};

// Load form settings on startup
try {
  if (fs.existsSync(formSettingsPath)) {
    formSettings = JSON.parse(fs.readFileSync(formSettingsPath, 'utf8'));
  }
} catch (error) {
  console.error('Error loading form settings:', error);
  formSettings = { autoDisplayFormResults: false };
}

// Load logging channel settings on startup
try {
  if (fs.existsSync(loggingChannelSettingsPath)) {
    loggingChannelSettings = JSON.parse(fs.readFileSync(loggingChannelSettingsPath, 'utf8'));
  }
} catch (error) {
  console.error('Error loading logging channel settings:', error);
  loggingChannelSettings = {};
}

// API to get auto display form results setting
app.get('/api/auto-display-form-results', (req, res) => {
  res.json({ enabled: formSettings.autoDisplayFormResults || false });
});

// API to set auto display form results setting
app.post('/api/auto-display-form-results', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid value for enabled' });
  }
  formSettings.autoDisplayFormResults = enabled;
  try {
    fs.writeFileSync(formSettingsPath, JSON.stringify(formSettings, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving form settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// API to get logging channel for a guild
app.get('/api/logging-channel/:guildId', (req, res) => {
  const { guildId } = req.params;
  const channelId = loggingChannelSettings[guildId] || '';
  res.json({ channelId });
});

// API to set logging channel for a guild
app.post('/api/logging-channel/:guildId', (req, res) => {
  const { guildId } = req.params;
  const { channelId } = req.body;
  if (typeof channelId !== 'string') {
    return res.status(400).json({ error: 'Invalid channelId' });
  }
  loggingChannelSettings[guildId] = channelId;
  try {
    fs.writeFileSync(loggingChannelSettingsPath, JSON.stringify(loggingChannelSettings, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving logging channel settings:', error);
    res.status(500).json({ error: 'Failed to save logging channel setting' });
  }
});

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: 4001 });

// Keep track of connected clients
const clients = new Set();
let activeTickets = {};

// Initialize Discord bot
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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
let ticketCounters = {}; // { guildId: nextTicketNumber }
let panelConfigs = {}; // Store panel configurations per guild/channel

// Discord bot token from environment variable
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error('Discord bot token not found in environment variables');
  process.exit(1);
}

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
      let member = guild.members.cache.get(ticket.userId);
      if (!member) {
        try {
          member = await guild.members.fetch(ticket.userId);
        } catch (e) {
          member = null;
        }
      }
      const username = member ? (member.user.tag || member.user.username) : 'Unknown';
      tickets.push({
        ...ticket,
        username
      });
    }
  }
  res.json(tickets);
});

app.get('/api/ticket-messages/:ticketNumber', (req, res) => {
  const { ticketNumber } = req.params;
  let messages = [];
  for (const guildId in activeTickets) {
    if (activeTickets[guildId][ticketNumber]) {
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

    const channelObj = await client.channels.fetch(channelId);
    if (!channelObj) {
      return res.status(404).json({ error: 'Channel not found', success: false });
    }
    if (!panelConfigs[channelObj.guild.id]) {
      panelConfigs[channelObj.guild.id] = {};
    }
    panelConfigs[channelObj.guild.id][channelId] = {
      title,
      parentCategoryId
    };

    const channel = channelObj;
    const permissions = channel.permissionsFor(client.user);
    if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
      return res.status(403).json({ error: 'Bot lacks required permissions in this channel', success: false });
    }

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

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
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
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
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

// Bot startup
client.once('ready', () => {
  console.log('Discord bot is ready!');
  connectedGuilds = client.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name
  }));
  broadcastUpdate({
    type: 'GUILD_UPDATE',
    guilds: connectedGuilds
  });
});

// Handle slash commands and interactions
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;

    if (interaction.isCommand()) {
      if (interaction.commandName === 'dnd') {
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

        if (!ticketNumber) {
          return interaction.reply({
            content: 'This command can only be used inside an active ticket channel.',
            ephemeral: true
          });
        }

        if (activeTickets[guildId][ticketNumber].dnd) {
          return interaction.reply({
            content: 'This ticket is already in Do Not Disturb mode.',
            ephemeral: true
          });
        }

        try {
          activeTickets[guildId][ticketNumber].dnd = true;
          activeTickets[guildId][ticketNumber].lastUpdated = new Date();

          let username = 'Unknown';
          try {
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
              let member = guild.members.cache.get(activeTickets[guildId][ticketNumber].userId);
              if (!member) {
                member = await guild.members.fetch(activeTickets[guildId][ticketNumber].userId);
              }
              if (member) {
                username = member.user.tag || member.user.username;
              }
            }
          } catch (e) {
            username = 'Unknown';
          }
          const ticketWithUsername = {
            ...activeTickets[guildId][ticketNumber],
            username
          };
          broadcastUpdate({
            type: 'TICKET_UPDATE',
            guildId: guildId,
            ticketNumber: ticketNumber,
            ticket: ticketWithUsername
          });

          await interaction.reply({
            content: 'Do Not Disturb mode activated for this ticket. The bot will no longer reply here.',
            flags: 64
          });
        } catch (error) {
          console.error('Error setting DND mode:', error);
          await interaction.reply({
            content: 'Failed to activate Do Not Disturb mode. Please try again later.',
            flags: 64
          });
        }
      }
    }

    if (interaction.isModalSubmit()) {
      console.log('Modal submit interaction received with customId:', interaction.customId);
      if (interaction.customId.startsWith('submit_ticket_form')) {
        await interaction.deferReply({ ephemeral: true });
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        
        const responses = {};
        formQuestions.forEach(q => {
          responses[q.id] = interaction.fields.getTextInputValue(q.id);
        });
        
        if (!ticketCounters[guildId]) ticketCounters[guildId] = 1;
        let ticketNumber = ticketCounters[guildId];
        ticketCounters[guildId]++;
        if (ticketCounters[guildId] > 9999) ticketCounters[guildId] = 1;
        ticketNumber = ticketNumber.toString().padStart(4, '0');
        
        try {
          const parentCategoryId = interaction.customId.split(':')[1] || null;
          console.log(`Creating ticket channel under category: ${parentCategoryId}`);

          const channelOptions = {
            name: ticketNumber,
            type: 0,
            parent: parentCategoryId,
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
            ],
            reason: 'Ticket created'
          };

          const channel = await interaction.guild.channels.create(channelOptions);
          
          if (!activeTickets[guildId]) activeTickets[guildId] = {};
          console.log(`Assigning panelTitle for ticket ${ticketNumber} in guild ${guildId}, channel ${channel.id}: ${panelConfigs[guildId]?.[channel.id]?.title}`);
          activeTickets[guildId][ticketNumber] = {
            ticketNumber,
            userId,
            channelId: channel.id,
            createdAt: new Date(),
            status: 'active',
            lastUpdated: new Date(),
            dnd: false,
            formResponses: responses,
            messages: [],
            panelTitle: panelConfigs[guildId]?.[channel.id]?.title || 'Unknown Panel'
          };

          const issueQuestionId = 'q1748382343618';
          const issueDescription = responses[issueQuestionId];
          if (issueDescription && issueDescription.trim().length > 0) {
            handleAIReply(guildId, ticketNumber, issueDescription.trim());
          }

          const embedsToSend = [];
          if (formSettings.autoDisplayFormResults) {
            const hasResponses = formQuestions.some(q => {
              const resp = responses[q.id];
              return resp !== undefined && resp !== null && resp !== '' && resp !== 'No response';
            });
            const descriptionText = hasResponses ? 'Form Responses:' : '';
            const formEmbed = new EmbedBuilder()
              .setTitle('Ticket Information')
              .setColor('#5865F2')
              .addFields([
                {
                  name: '\u200B',
                  value: (() => {
                    if (formQuestions.length === 0) return '';
                    return formQuestions.map(q => {
                      let response = responses[q.id];
                      if (response === undefined || response === null || response === '') {
                        response = 'No response';
                      }
                      response = response.replace(/`/g, '\'');
                      if (response.includes('\n')) {
                        response = response.replace(/\n/g, '\\n');
                        return `**${q.question}**\n${response}`;
                      } else {
                        return `**${q.question}**\n\`\`\`\n${response}\n\`\`\``;
                      }
                    }).join('\n\n');
                  })(),
                  inline: false
                }
              ]);
            embedsToSend.push(formEmbed);
          }

          const closeButton = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
            );

          await channel.send({
            embeds: embedsToSend,
            components: [closeButton]
          });

          await interaction.editReply({
            content: `Your ticket has been created: <#${channel.id}>`
          });

          setTimeout(async () => {
            try {
              await interaction.deleteReply();
            } catch (err) {
            }
          }, 5000);

          let username = 'Unknown';
          try {
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
              let member = guild.members.cache.get(activeTickets[guildId][ticketNumber].userId);
              if (!member) {
                member = await guild.members.fetch(activeTickets[guildId][ticketNumber].userId);
              }
              if (member) {
                username = member.user.tag || member.user.username;
              }
            }
          } catch (e) {
            username = 'Unknown';
          }
          const ticketWithUsername = {
            ...activeTickets[guildId][ticketNumber],
            username
          };
          broadcastUpdate({
            type: 'TICKET_UPDATE',
            guildId: guildId,
            ticketNumber: ticketNumber,
            ticket: ticketWithUsername
          });
        } catch (error) {
          console.error('Error creating ticket:', error);
          if (error.stack) {
            console.error(error.stack);
          }
          await interaction.reply({
            content: `There was an error creating your ticket: ${error.message || 'Please try again later.'}`,
            ephemeral: true
          });
        }
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('create_ticket')) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (!activeTickets[guildId]) activeTickets[guildId] = {};

        for (const tNum in activeTickets[guildId]) {
          if (activeTickets[guildId][tNum].userId === userId && activeTickets[guildId][tNum].status === 'active') {
            return interaction.reply({
              content: `You already have an open ticket (#${tNum}). Please use that one.`,
              flags: 64
            });
          }
        }

        const buttonCustomId = interaction.customId;
        const categoryId = buttonCustomId.split(':')[1] || '';

        const modal = new ModalBuilder()
          .setCustomId(`submit_ticket_form:${categoryId}`)
          .setTitle('Support Ticket Form');

        const actionRows = formQuestions.map(q => {
          const style = q.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short;
          const required = q.required === true;
          let minLength = (typeof q.min === 'number' && q.min > 0) ? q.min : undefined;
          let maxLength = (typeof q.max === 'number' && q.max > 0) ? q.max : undefined;
          const placeholder = q.placeholder || undefined;

          const textInput = new TextInputBuilder()
            .setCustomId(q.id)
            .setLabel(q.question.length > 45 ? q.question.substring(0, 45) : q.question)
            .setStyle(style)
            .setRequired(required);

          if (minLength !== undefined) {
            textInput.setMinLength(minLength);
          }
          if (maxLength !== undefined) {
            textInput.setMaxLength(maxLength);
          }
          if (placeholder !== undefined) {
            textInput.setPlaceholder(placeholder);
          }

          return new ActionRowBuilder().addComponents(textInput);
        });

        modal.addComponents(actionRows);

        await interaction.showModal(modal);
        return;
      } else if (interaction.customId === 'close_ticket') {
        try {
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('confirm_close')
                .setLabel('Close')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('cancel_close')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
            );

          await interaction.deferUpdate();

          const channel = interaction.channel;
          await channel.send({
            content: 'Are you sure you would like to close this ticket?',
            components: [row]
          });
        } catch (error) {
          console.error('Error sending close confirmation:', error);
          try {
            await interaction.followUp({
              content: 'There was an error processing your request.',
              components: []
            });
          } catch (editError) {
            console.error('Error following up after close confirmation error:', editError);
          }
        }
      } else if (interaction.customId === 'confirm_close') {
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

            activeTickets[guildId][ticketNumber].messages = [];

            let username = 'Unknown';
            try {
              const guild = client.guilds.cache.get(guildId);
              if (guild) {
                let member = guild.members.cache.get(activeTickets[guildId][ticketNumber].userId);
                if (!member) {
                  member = await guild.members.fetch(activeTickets[guildId][ticketNumber].userId);
                }
                if (member) {
                  username = member.user.tag || member.user.username;
                }
              }
            } catch (e) {
              username = 'Unknown';
            }
            const ticketWithUsername = {
              ...activeTickets[guildId][ticketNumber],
              username
            };
            broadcastUpdate({
              type: 'TICKET_UPDATE',
              guildId: guildId,
              ticketNumber: ticketNumber,
              ticket: ticketWithUsername
            });

            try {
              const loggingChannelId = loggingChannelSettings[guildId];
              if (loggingChannelId) {
                const logChannel = await client.channels.fetch(loggingChannelId);
                if (logChannel) {
                  const embed = new EmbedBuilder()
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .setColor('#FFD700')
                    .addFields(
                      { name: 'Logged Info', value: `Ticket: Closed-${ticketNumber}\nAction: Closed`, inline: true },
                      { name: 'Panel', value: 'OnePlay General Support', inline: true }
                    );
                  await logChannel.send({ embeds: [embed] });
                }
              }
            } catch (err) {
              console.error('Error sending log embed:', err);
            }

            try {
              const channel = await client.channels.fetch(activeTickets[guildId][ticketNumber].channelId);
              if (channel) {
                const closedByMessage = `Ticket Closed by <@${interaction.user.id}>`;
                const controlsRow = new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId('transcript_ticket')
                      .setLabel('Transcript')
                      .setStyle(ButtonStyle.Secondary)
                      .setEmoji('📄'),
                    new ButtonBuilder()
                      .setCustomId('open_ticket')
                      .setLabel('Open')
                      .setStyle(ButtonStyle.Success)
                      .setEmoji('🔓'),
                    new ButtonBuilder()
                      .setCustomId('delete_ticket')
                      .setLabel('Delete')
                      .setStyle(ButtonStyle.Danger)
                      .setEmoji('⛔')
                  );
                const closedEmbed = new EmbedBuilder()
                  .setColor('#FFD700')
                  .setDescription(`Ticket Closed by <@${interaction.user.id}>`);
                await channel.send({ embeds: [closedEmbed] });
                await channel.send({ content: '`Support team ticket controls`', components: [controlsRow] });
              }
            } catch (err) {
              console.error('Error sending ticket closed controls:', err);
            }

            await interaction.update({
              content: 'This ticket has been closed.',
              components: []
            });

            try {
              await interaction.deleteReply();
            } catch (err) {
              console.error('Error deleting ephemeral confirmation message:', err);
            }
          } else {
            await interaction.update({
              content: 'Unable to find ticket information. Please close it manually.',
              components: []
            });
          }
        } catch (error) {
          console.error('Error closing ticket:', error);
          try {
            await interaction.update({
              content: 'There was an error closing this ticket.',
              components: []
            });
          } catch (editError) {
            console.error('Error editing reply after close ticket error:', editError);
          }
        }
      } else if (interaction.customId === 'cancel_close') {
        try {
          await interaction.update({
            content: 'Ticket close cancelled.',
            components: []
          });
          try {
            await interaction.deleteReply();
          } catch (err) {
            console.error('Error deleting ephemeral confirmation message:', err);
          }
        } catch (error) {
          console.error('Error cancelling ticket close:', error);
          try {
            await interaction.editReply({
              content: 'There was an error cancelling the ticket close.',
              components: []
            });
          } catch (editError) {
            console.error('Error editing reply after cancel close error:', editError);
          }
        }
      } else if (interaction.customId === 'open_ticket') {
        try {
          await interaction.deferUpdate();
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
            activeTickets[guildId][ticketNumber].status = 'active';
            activeTickets[guildId][ticketNumber].lastUpdated = new Date();

            let username = 'Unknown';
            try {
              const guild = client.guilds.cache.get(guildId);
              if (guild) {
                let member = guild.members.cache.get(activeTickets[guildId][ticketNumber].userId);
                if (!member) {
                  member = await guild.members.fetch(activeTickets[guildId][ticketNumber].userId);
                }
                if (member) {
                  username = member.user.tag || member.user.username;
                }
              }
            } catch (e) {
              username = 'Unknown';
            }
            const ticketWithUsername = {
              ...activeTickets[guildId][ticketNumber],
              username
            };
            broadcastUpdate({
              type: 'TICKET_UPDATE',
              guildId,
              ticketNumber,
              ticket: ticketWithUsername
            });

            try {
              const loggingChannelId = loggingChannelSettings[guildId];
              if (loggingChannelId) {
                const logChannel = await client.channels.fetch(loggingChannelId);
                if (logChannel) {
                  const embed = new EmbedBuilder()
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .setColor('#00FF00')
                    .addFields(
                      { name: 'Logged Info', value: `Ticket-${ticketNumber}\nAction: Opened`, inline: true },
                      { name: 'Panel', value: 'OnePlay General Support', inline: true }
                    );
                  await logChannel.send({ embeds: [embed] });
                }
              }
            } catch (err) {
              console.error('Error sending log embed:', err);
            }

            const channel = await client.channels.fetch(channelId);
            if (channel) {
              try {
                const messages = await channel.messages.fetch({ limit: 20 });
                for (const message of messages.values()) {
                  if (message.content === '`Support team ticket controls`' || message.content.startsWith('Ticket Closed by')) {
                    await message.delete();
                  }
                }
              } catch (err) {
                console.error('Error deleting support controls messages:', err);
              }

              const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(`Ticket Opened by <@${interaction.user.id}>`);
              await channel.send({ embeds: [embed] });
            }
          } else {
            try {
              await interaction.followUp({
                content: 'Unable to find ticket information. Please reopen it manually.',
                components: []
              });
            } catch (err) {
              console.error('Error following up after missing ticket info:', err);
            }
          }
        } catch (error) {
          console.error('Error reopening ticket:', error);
          try {
            await interaction.followUp({
              content: 'There was an error reopening this ticket.',
              components: []
            });
          } catch (err) {
            console.error('Error following up after reopen error:', err);
          }
        }
      } else if (interaction.customId === 'delete_ticket') {
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
          if (!ticketNumber) {
            await interaction.update({
              content: 'Unable to find ticket information. Please delete it manually.',
              components: []
            });
            return;
          }

          setTimeout(async () => {
            try {
              const channel = await client.channels.fetch(channelId);
              if (channel) {
                await channel.delete('Ticket deleted by user');
              }
              if (activeTickets[guildId]) {
                delete activeTickets[guildId][ticketNumber];
              }

              try {
                const loggingChannelId = loggingChannelSettings[guildId];
                if (loggingChannelId) {
                  const logChannel = await client.channels.fetch(loggingChannelId);
                  if (logChannel) {
                    const embed = new EmbedBuilder()
                      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                      .setColor('#FF0000')
                      .addFields(
                        { name: 'Logged Info', value: `Ticket: Ticket-${ticketNumber}\nAction: Deleted`, inline: true },
                        { name: 'Panel', value: panelConfigs[guildId]?.[channelId]?.title || 'OnePlay General Support', inline: true }
                      );
                    await logChannel.send({ embeds: [embed] });
                  }
                }
              } catch (err) {
                console.error('Error sending delete log embed:', err);
              }

              broadcastUpdate({
                type: 'TICKET_UPDATE',
                guildId,
                ticketNumber,
                ticket: null
              });
            } catch (error) {
              console.error('Error deleting ticket channel:', error);
            }
          }, 5000);

          await interaction.update({
            content: 'Deleting ticket in 5 seconds...',
            components: []
          });
        } catch (error) {
          console.error('Error handling delete_ticket interaction:', error);
          try {
            await interaction.update({
              content: 'There was an error deleting this ticket.',
              components: []
            });
          } catch (editError) {
            console.error('Error updating interaction after delete error:', editError);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error handling interactionCreate event:', err);
    if (interaction.replied || interaction.deferred) {
      return;
    }
    try {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        flags: 64
      });
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
});

const AIService = require('./aiService');
const aiService = new AIService(process.env.OPENAI_API_KEY);

// Listen for new messages in ticket channels and broadcast updates
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    const guildId = message.guild.id;
    let ticketNumber = null;
    if (activeTickets[guildId]) {
      for (const tNum in activeTickets[guildId]) {
        if (activeTickets[guildId][tNum].channelId === message.channel.id) {
          ticketNumber = tNum;
          break;
        }
      }
    }
    if (!ticketNumber) return;

    if (activeTickets[guildId][ticketNumber].dnd) {
      return;
    }

    const ticketMessage = {
      timestamp: message.createdAt.toISOString(),
      content: message.content,
      sender: message.author.username
    };
    if (!activeTickets[guildId][ticketNumber].messages) {
      activeTickets[guildId][ticketNumber].messages = [];
    }
    activeTickets[guildId][ticketNumber].messages.push(ticketMessage);

    broadcastUpdate({
      type: 'TICKET_MESSAGE',
      ticketNumber,
      message: ticketMessage
    });

    handleAIReply(guildId, ticketNumber, message.content);

  } catch (err) {
    console.error('Error handling messageCreate event:', err);
  }
});

// Helper function to handle AI reply generation and posting with streaming
async function handleAIReply(guildId, ticketNumber, userMessage) {
  try {
    const context = await aiService.extractKnowledgeContext(userMessage);

    const previousMessages = activeTickets[guildId][ticketNumber].messages || [];
    const messageHistory = previousMessages.slice(-5).map(msg => ({
      role: msg.sender === 'AI Bot' ? 'assistant' : 'user',
      content: msg.content
    }));

    const systemPrompt = aiService.getSystemPrompt(userMessage);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...messageHistory,
      { role: 'user', content: `User message: ${userMessage}\n\nContext: ${context}\n\nProvide a helpful support reply.` }
    ];

    const stream = await aiService.streamResponse(messages);

    let aiReply = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        aiReply += content;
      }
    }

    const channelId = activeTickets[guildId][ticketNumber].channelId;
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error(`Channel not found for ticket ${ticketNumber} in guild ${guildId}`);
      return;
    }
    const sentMessage = await channel.send({
      content: aiReply
    });

    const aiMessage = {
      timestamp: new Date().toISOString(),
      content: aiReply,
      sender: 'AI Bot',
      messageId: sentMessage.id
    };
    activeTickets[guildId][ticketNumber].messages.push(aiMessage);

    broadcastUpdate({
      type: 'TICKET_MESSAGE',
      ticketNumber,
      message: aiMessage
    });

  } catch (error) {
    console.error('Error in handleAIReply:', error);
  }
}

// Handle bot joining a new server
client.on('guildCreate', async (guild) => {
  connectedGuilds.push({
    id: guild.id,
    name: guild.name
  });
  try {
    await guild.channels.fetch();
  } catch (err) {
    console.error('Error fetching channels on guildCreate:', err);
  }
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

// Start the Express server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

// Login to Discord
client.login(TOKEN).catch(error => {
  console.error('Error logging in to Discord:', error);
});