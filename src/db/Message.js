const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
  slackTs: { type: String, required: true },
  channel: { type: String, required: true },
  type: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  place: { type: String },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('Message', messageSchema) 