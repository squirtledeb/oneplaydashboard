const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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

// New: Form settings file path and default
const formSettingsPath = path.join(__dirname, 'formSettings.json');
let formSettings = { autoDisplayFormResults: false };

// Load form settings on startup
try {
  if (fs.existsSync(formSettingsPath)) {
    formSettings = JSON.parse(fs.readFileSync(formSettingsPath, 'utf8'));
  }
} catch (error) {
  console.error('Error loading form settings:', error);
  formSettings = { autoDisplayFormResults: false };
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
      // Use member.user.tag if available for better username display
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
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found', success: false });
    }
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

          // Optionally broadcast ticket update with DND status
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

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      console.log('Modal submit interaction received with customId:', interaction.customId);
      if (interaction.customId.startsWith('submit_ticket_form')) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        
        // Get form responses
        const responses = {};
        formQuestions.forEach(q => {
          responses[q.id] = interaction.fields.getTextInputValue(q.id);
        });
        
        // Generate ticket number
        if (!ticketCounters[guildId]) ticketCounters[guildId] = 1;
        let ticketNumber = ticketCounters[guildId];
        ticketCounters[guildId]++;
        if (ticketCounters[guildId] > 9999) ticketCounters[guildId] = 1;
        ticketNumber = ticketNumber.toString().padStart(4, '0');
        
        try {
          // Create a new ticket channel
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
          
          // Store ticket with form responses
          if (!activeTickets[guildId]) activeTickets[guildId] = {};
          activeTickets[guildId][ticketNumber] = {
            ticketNumber,
            userId,
            channelId: channel.id,
            createdAt: new Date(),
            status: 'active',
            lastUpdated: new Date(),
            dnd: false,
            formResponses: responses,
            messages: []
          };

          // Create form responses embed if auto display is enabled
          const embedsToSend = [];
          if (formSettings.autoDisplayFormResults) {
            // Check if any response is non-empty
            const hasResponses = formQuestions.some(q => {
              const resp = responses[q.id];
              return resp !== undefined && resp !== null && resp !== '' && resp !== 'No response';
            });
            const descriptionText = hasResponses ? 'Form Responses:' : '';
            const formEmbed = new EmbedBuilder()
              .setTitle('Ticket Information')
              .setColor('#5865F2')
              //.setDescription(descriptionText)
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
                    // Replace backticks in response to avoid breaking code block
                    response = response.replace(/`/g, '\'');
                    // Format response as inline code if single line, else plain text with escaped newlines
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

          await interaction.reply({
            content: `Your ticket has been created: <#${channel.id}>`,
            flags: 64
          });

          // Delete the ephemeral reply after 5 seconds
          setTimeout(async () => {
            try {
              if (interaction.deferred || interaction.replied) {
                await interaction.deleteReply();
              }
            } catch (err) {
              // Ignore errors if reply already deleted or cannot be deleted
            }
          }, 5000);

          // Broadcast ticket creation update to clients
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

    // Handle button interactions
    if (interaction.isButton()) {
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

        // Create modal with form questions
        // Extract category ID from button customId
        const buttonCustomId = interaction.customId; // e.g. 'create_ticket:<categoryId>'
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

          // Removed logic that sets minLength to undefined when min and max are equal to show correct minLength in label
          // if (minLength !== undefined && maxLength !== undefined && minLength === maxLength) {
          //   minLength = undefined;
          // }

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

            // Resolve username before broadcasting
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
          console.error('Error closing ticket:', error);
          await interaction.reply({
            content: 'There was an error closing this ticket.',
            flags: 64
          });
        }
      }
    }
  } catch (err) {
    console.error('Error handling interactionCreate event:', err);
    if (interaction.replied || interaction.deferred) {
      // Interaction already replied or deferred, cannot reply again
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
    if (message.author.bot) return; // Ignore bot messages
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
    if (!ticketNumber) return; // Not a ticket channel

    // Check if ticket is in DND mode
    if (activeTickets[guildId][ticketNumber].dnd) {
      // Do not trigger AI reply if DND is active
      return;
    }

    // Store user message
    const ticketMessage = {
      timestamp: message.createdAt.toISOString(),
      content: message.content,
      sender: message.author.username
    };
    if (!activeTickets[guildId][ticketNumber].messages) {
      activeTickets[guildId][ticketNumber].messages = [];
    }
    activeTickets[guildId][ticketNumber].messages.push(ticketMessage);

    // Broadcast new ticket message to clients
    broadcastUpdate({
      type: 'TICKET_MESSAGE',
      ticketNumber,
      message: ticketMessage
    });

    // Trigger AI reply asynchronously
    handleAIReply(guildId, ticketNumber, message.content);

  } catch (err) {
    console.error('Error handling messageCreate event:', err);
  }
});

const { PassThrough } = require('stream');

// Helper function to handle AI reply generation and posting with streaming using OpenAI client library
async function handleAIReply(guildId, ticketNumber, userMessage) {
  try {
    // Extract relevant context for the user message
    const context = await aiService.extractKnowledgeContext(userMessage);

    // Construct prompt with context and user message
    const prompt = `Based on the following context:\n${context}\n\nUser message:\n${userMessage}\n\nProvide a helpful support reply.`;

    // Get the streaming response (async iterable)
    const stream = await aiService.streamResponse(prompt);

    let aiReply = '';

    // Iterate asynchronously over the streaming response chunks
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        aiReply += content;
        // Optionally, partial updates can be broadcast here for real-time UI updates
      }
    }

    // After streaming completes, post the accumulated AI reply
    const channelId = activeTickets[guildId][ticketNumber].channelId;
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error(`Channel not found for ticket ${ticketNumber} in guild ${guildId}`);
      return;
    }
    const sentMessage = await channel.send({
      content: aiReply
    });

    // Update activeTickets with AI reply
    const aiMessage = {
      timestamp: new Date().toISOString(),
      content: aiReply,
      sender: 'AI Bot',
      messageId: sentMessage.id
    };
    activeTickets[guildId][ticketNumber].messages.push(aiMessage);

    // Broadcast AI message to clients
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

// Login to Discord with your client's token
client.login(TOKEN).catch(error => {
  console.error('Error logging in to Discord:', error);
});