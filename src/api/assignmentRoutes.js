const express = require('express')
const router = express.Router()
const Assignment = require('../db/Assignment')
const { postThreadReply, getChannelMembers } = require('../slack/slackService')

// Assign a message to a user
router.post('/assign', async (req, res) => {
  const { slackTs, assignedTo, assignedBy } = req.body
  if (!slackTs || !assignedTo || !assignedBy) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  try {
    const assignment = new Assignment({
      slackTs,
      channel: process.env.SLACK_CHANNEL_HOMEWORK,
      assignedTo,
      assignedBy
    })
    await assignment.save()
    res.json({ success: true, assignment })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get users in Homework channel
router.get('/channel-users', async (req, res) => {
  try {
    const members = await getChannelMembers()
    res.json({ members })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Reply to a message thread
router.post('/reply', async (req, res) => {
  const { thread_ts, text } = req.body
  if (!thread_ts || !text) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  try {
    const result = await postThreadReply(process.env.SLACK_CHANNEL_HOMEWORK, thread_ts, text)
    res.json({ success: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
