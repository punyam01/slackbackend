const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  slackId: { type: String, required: true, unique: true },
  name: { type: String },
  isAdmin: { type: Boolean, default: false },
  preferences: {
    chat_leads: { type: Boolean, default: true },
    schedule_tour: { type: Boolean, default: true },
    applications: { type: Boolean, default: false }
  }
});

module.exports = mongoose.model('User', userSchema);
