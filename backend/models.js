const mongoose = require('mongoose');

const formQuestionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  question: { type: String, required: true },
  placeholder: { type: String, default: '' },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 500 },
  required: { type: Boolean, default: false },
  multiline: { type: Boolean, default: false }
});

const formSettingsSchema = new mongoose.Schema({
  autoDisplayFormResults: { type: Boolean, default: false }
}, { collection: 'formSettings' });

const loggingChannelSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true }
});

const ticketSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: false },
  ticketNumber: { type: String, required: true },
  status: { type: String, required: true }, // active, closed, resolved, etc.
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  createdAt: { type: Date, required: true },
  closedAt: { type: Date },
  formResponses: { type: Object, default: {} },
  messages: { type: Array, default: [] }
});

const FormQuestion = mongoose.model('FormQuestion', formQuestionSchema);
const FormSettings = mongoose.model('FormSettings', formSettingsSchema);
const LoggingChannelSetting = mongoose.model('LoggingChannelSetting', loggingChannelSettingsSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = {
  FormQuestion,
  FormSettings,
  LoggingChannelSetting,
  Ticket
};
