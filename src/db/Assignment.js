const mongoose = require('mongoose')
const assignmentSchema = new mongoose.Schema({
  slackTs: { type: String, required: true },
  channel: { type: String, required: true },
  assignedTo: { type: String, required: true },
  assignedBy: { type: String, required: true },
  assignedAt: { type: Date, default: Date.now }
})
module.exports = mongoose.model('Assignment', assignmentSchema)
