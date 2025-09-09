const express = require('express')
const router = express.Router()
const { postMessageToHomework, postThreadReply, slack } = require('../slack/slackService')
const { getMessageView } = require('../slack/messageView')
const User = require('../db/User')

const Message = require('../db/Message')

// Post a new message to Homework channel
router.post('/send', async (req, res) => {
  const { name, email, message, type, phone, place, thread_ts, channel, assignedTo } = req.body
  if (!name || !email || !message || !type) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  try {
    // Only check admin's preferences
    const admin = await User.findOne({ isAdmin: true });
    if (!admin || !admin.preferences[type]) {
      // Admin has disabled this type, don't post the message
      console.log(`Admin has disabled ${type} messages. Not posting to Slack.`);
      return res.json({ success: false });
    }

    let result;
    let slackTs;
    let channelId = channel;
    
    if (thread_ts && channel) {
      // If thread_ts and channel are provided, post as a reply to the existing thread
      result = await postThreadReply(channel, thread_ts, `${name} (${email}) replied: ${message}`);
      slackTs = thread_ts;
    } else {
      // Otherwise, post as a new message with buttons
      const slackResult = await postMessageToHomework(
        getMessageView({ name, email, phone, place, message, type })
      );
      result = slackResult;
      slackTs = slackResult.ts;
      channelId = slackResult.channel;
    }
    
    // Save the message to the database
    await Message.create({
      slackTs,
      channel: channelId,
      type,
      name,
      email,
      phone,
      place,
      message
    });
    
    // Always return the Slack message's ts and channel for frontend use
    res.json({ success: true, ts: slackTs, channel: channelId, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get messages filtered by user preferences
router.get('/messages/:slackId', async (req, res) => {
  try {
    const user = await User.findOne({ slackId: req.params.slackId })
    if (!user) return res.status(404).json({ error: 'User not found' })
    const enabledTypes = Object.entries(user.preferences)
      .filter(([type, enabled]) => enabled)
      .map(([type]) => type)
    const messages = await Message.find({ type: { $in: enabledTypes } }).sort({ createdAt: -1 })
    res.json({ messages })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get user preferences
router.get('/preferences/:slackId', async (req, res) => {
  try {
    const user = await User.findOne({ slackId: req.params.slackId })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ preferences: user.preferences })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update user preferences
router.post('/preferences/:slackId', async (req, res) => {
  try {
    const { preferences } = req.body;
    await User.findOneAndUpdate(
      { slackId: req.params.slackId },
      { preferences },
      { new: true, upsert: true }
    );
    const updated = await User.findOne({ slackId: req.params.slackId });
    res.json({ preferences: updated.preferences });
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
