require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const fetch = require('node-fetch')
const assignmentRoutes = require('./api/assignmentRoutes')
const slackRoutes = require('./api/slackRoutes')
const { slackEvents, slack, publishHome } = require('./slack/slackService')
const Assignment = require('./db/Assignment')
const User = require('./db/User')

const app = express()

// Webhook URL for your website (set this in your .env file)
const WEBSITE_WEBHOOK_URL = process.env.WEBSITE_WEBHOOK_URL || 'https://your-website.com/webhook'

// Function to send data to your website
async function sendToWebsite(data) {
  try {
    if (WEBSITE_WEBHOOK_URL && WEBSITE_WEBHOOK_URL !== 'https://your-website.com/webhook') {
      await fetch(WEBSITE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      console.log('Data sent to website:', data.type);
    }
  } catch (error) {
    console.error('Failed to send data to website:', error);
  }
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Mongoose connected');

  // Add debugging middleware for all requests
app.use((req, res, next) => {
  console.log('Request received:')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  console.log('Content-Type:', req.get('content-type'))
  next()
})

  // Slack Events API endpoint (must come before body parsing)
  app.post('/slack/events', slackEvents.expressMiddleware());

  // Parse URL-encoded bodies for Slack interactive components (after events)
  app.use(express.urlencoded({ extended: true }));

  // Handle all Slack interactive components
  app.post('/slack/interactive', async (req, res) => {
    const payload = JSON.parse(req.body.payload);

    // Save preferences button from home view
    if (payload.type === 'block_actions' && payload.actions[0].action_id === 'open_preferences_modal') {
      const userId = payload.user.id;
      const user = await User.findOne({ slackId: userId });
      if (!user || !user.isAdmin) {
        // Only admin can save preferences; show a modal popup for non-admins
        await slack.views.open({
          trigger_id: payload.trigger_id,
          view: {
            type: 'modal',
            title: { type: 'plain_text', text: 'Not Allowed' },
            close: { type: 'plain_text', text: 'Close' },
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: ':lock: Only the admin can change preferences.' }
              }
            ]
          }
        });
        return res.send();
      }
      const values = payload.view.state.values;
      const selected = values.preferences_section.toggle_preferences.selected_options.map(o => o.value);
      const preferences = {
        chat_leads:    selected.includes('chat_leads'),
        schedule_tour: selected.includes('schedule_tour'),
        applications:  selected.includes('applications'),
      };
      await User.findOneAndUpdate(
        { slackId: userId },
        { preferences },
        { new: true, upsert: true }
      );
      await publishHome(userId, preferences);
      return res.send();
    }

    // Modal submissions
  if (payload.type === 'view_submission' && payload.view.callback_id === 'reply_modal') {
    const user = payload.user.id;
    const { channel, slackTs } = JSON.parse(payload.view.private_metadata);
    const reply = payload.view.state.values.reply_block.reply_input.value;
    await slack.chat.postMessage({
      channel,
      thread_ts: slackTs,
      text: `<@${user}> replied: ${reply}`
    });
    return res.json({ response_action: 'clear' });
  }

  if (payload.type === 'view_submission' && payload.view.callback_id === 'assign_modal') {
      const meta = JSON.parse(payload.view.private_metadata);
      const { channel, slackTs, name, email, phone, place, message, type } = meta;
      const assignBlock = payload.view.state.values.assign_block.assign_user_select;
      if (!assignBlock || !assignBlock.selected_option) {
        console.error('No user selected in assign modal:', payload.view.state.values);
        return res.status(400).send('No user selected');
      }
      const assignedTo = assignBlock.selected_option.value;
    const assignedBy = payload.user.id;
    const assignment = new Assignment({
      slackTs,
      channel,
      assignedTo,
      assignedBy
    });
    await assignment.save();
    const im = await slack.conversations.open({ users: assignedTo });
    await slack.chat.postMessage({
      channel: im.channel.id,
      text: `You have been assigned a message in <#${channel}> by <@${assignedBy}>.`
    });
      const { getMessageView } = require('./slack/messageView');
      // Check if assigner is admin
      const assigner = await User.findOne({ slackId: assignedBy });
      const updatedView = getMessageView({ name, email, phone, place, message, type, assignedTo, assignedBy, isAdmin: assigner && assigner.isAdmin });
      await slack.chat.update({
        channel,
        ts: slackTs,
        blocks: updatedView.blocks,
        text: updatedView.text
      });
    await sendToWebsite({
      type: 'assignment',
      assignedTo: assignedTo,
      assignedBy: assignedBy,
      thread_ts: slackTs,
      channel: channel,
      timestamp: new Date().toISOString()
    });
    return res.json({ response_action: 'clear' });
  }

    // Handler for 'please countersign ...' button
    if (payload.type === 'block_actions' && payload.actions[0].action_id === 'countersign_application') {
      let email = payload.actions[0].value;
      const channel = payload.channel.id;
      const slackTs = payload.message.ts;
      let name = '', firstName = '', lastName = '', phone = '', place = '', message = '', type = 'applications', assignedTo = '', assignedBy = '', isAdmin = false;
      for (const block of payload.message.blocks) {
        if (block.fields) {
          for (const field of block.fields) {
            if (field.text.startsWith('*Name:*') && !name) name = field.text.split('\n')[1] || name;
            if (field.text.startsWith('*First Name:*') && !firstName) firstName = field.text.split('\n')[1] || firstName;
            if (field.text.startsWith('*Last Name:*') && !lastName) lastName = field.text.split('\n')[1] || lastName;
            if (field.text.startsWith('*Phone #:*') && !phone) phone = field.text.split('\n')[1] || phone;
            if (field.text.startsWith('*eMail:*') && !email) email = field.text.split('\n')[1] || email;
            if (field.text.startsWith('*Place:*') && !place) place = field.text.split('\n')[1] || place;
          }
        }
        if (block.type === 'section' && block.text && block.text.text.startsWith('*Chat:*') && !message) {
          message = block.text.text.replace('*Chat:*\n', '') || message;
        }
        if (block.type === 'context' && block.elements && block.elements[0] && block.elements[0].text) {
          if (block.elements[0].text.includes('Chat Leads')) type = 'chat_leads';
          else if (block.elements[0].text.includes('Schedule a Tour')) type = 'schedule_tour';
          else if (block.elements[0].text.includes('Application Review')) type = 'applications';
        }
      }
      if (firstName || lastName) {
        name = `${firstName}${firstName && lastName ? ' ' : ''}${lastName}`.trim() || name;
      }
      if (!name) name = 'Unknown';
      for (const block of payload.message.blocks) {
        if (block.type === 'context' && block.elements && block.elements[0] && block.elements[0].text && block.elements[0].text.includes('assigned by:')) {
          const match = block.elements[0].text.match(/assigned by: <@(.*?)>.*to: <@(.*?)>/);
          if (match) {
            assignedBy = match[1];
            assignedTo = match[2];
          }
        }
      }
      await slack.views.open({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Countersign Application' },
          close: { type: 'plain_text', text: 'Cancel' },
          submit: { type: 'plain_text', text: 'Submit' },
          callback_id: 'countersign_modal',
          private_metadata: JSON.stringify({ 
            email, 
            channel, 
            slackTs, 
            name, 
            firstName, 
            lastName, 
            phone, 
            place, 
            message, 
            type, 
            assignedTo, 
            assignedBy, 
            isAdmin 
          }),
          blocks: [
            {
              type: 'input',
              block_id: 'countersign_block',
              label: { type: 'plain_text', text: 'Do you approve or reject this application?' },
              element: {
                type: 'radio_buttons',
                action_id: 'countersign_choice',
                options: [
                  {
                    text: { type: 'plain_text', text: '✅ Approve' },
                    value: 'Approved'
                  },
                  {
                    text: { type: 'plain_text', text: '❌ Reject' },
                    value: 'Rejected'
                  }
                ]
              }
            }
          ]
        }
      });
      return res.send();
    }

    // Handler for Approve/Reject in countersign modal (view_submission)
    if (payload.type === 'view_submission' && payload.view.callback_id === 'countersign_modal') {
      const userId = payload.user.id;
      const meta = JSON.parse(payload.view.private_metadata);
      const { channel, slackTs, name, firstName, lastName, email, phone, place, message, type, assignedTo, assignedBy, isAdmin } = meta;
      const choice = payload.view.state.values.countersign_block.countersign_choice.selected_option.value;
      const decision = choice;
      const { getMessageView } = require('./slack/messageView');
      let blocks = getMessageView({
        name,
        firstName,
        lastName,
        email,
        phone,
        place,
        message,
        type,
        assignedTo,
        assignedBy,
        isAdmin
      }).blocks;
      const newBlocks = blocks.map(block => {
        if (block.type === 'actions' && block.elements.some(el => el.action_id === 'countersign_application')) {
          const remainingElements = block.elements.filter(el => el.action_id !== 'countersign_application');
          const blocksToReturn = [];
          if (remainingElements.length > 0) {
            blocksToReturn.push({
              ...block,
              elements: remainingElements
            });
          }
          blocksToReturn.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${decision} by <@${userId}>*` }
          });
          return blocksToReturn;
        }
        return block;
      }).flat();
      await slack.chat.update({
        channel: channel,
        ts: slackTs,
        blocks: newBlocks,
        text: `${decision} by <@${userId}>`
      });
      return res.json({ response_action: 'clear' });
    }

    // Handler for 'See full application' button
    if (payload.type === 'block_actions' && payload.actions[0].action_id === 'view_application') {
      // Extract all application fields from the message blocks
      let email = payload.actions[0].value;
      let name = '', firstName = '', lastName = '', phone = '', place = '', message = '', type = 'applications';
      for (const block of payload.message.blocks) {
        if (block.fields) {
          for (const field of block.fields) {
            if (field.text.startsWith('*Name:*') && !name) name = field.text.split('\n')[1] || name;
            if (field.text.startsWith('*First Name:*') && !firstName) firstName = field.text.split('\n')[1] || firstName;
            if (field.text.startsWith('*Last Name:*') && !lastName) lastName = field.text.split('\n')[1] || lastName;
            if (field.text.startsWith('*Phone #:*') && !phone) phone = field.text.split('\n')[1] || phone;
            if (field.text.startsWith('*eMail:*') && !email) email = field.text.split('\n')[1] || email;
            if (field.text.startsWith('*Place:*') && !place) place = field.text.split('\n')[1] || place;
          }
        }
        if (block.type === 'section' && block.text && block.text.text.startsWith('*Chat:*') && !message) {
          message = block.text.text.replace('*Chat:*\n', '') || message;
        }
        if (block.type === 'context' && block.elements && block.elements[0] && block.elements[0].text) {
          if (block.elements[0].text.includes('Chat Leads')) type = 'chat_leads';
          else if (block.elements[0].text.includes('Schedule a Tour')) type = 'schedule_tour';
          else if (block.elements[0].text.includes('Application Review')) type = 'applications';
        }
      }
      if (firstName || lastName) {
        name = `${firstName}${firstName && lastName ? ' ' : ''}${lastName}`.trim() || name;
      }
      await slack.views.open({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Full Application' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text:
                `*First Name:* ${firstName || name.split(' ')[0] || name}\n*Last Name:* ${lastName || name.split(' ').slice(1).join(' ') || 'N/A'}\n*Phone #:* ${phone}\n*eMail:* ${email}\n*Place:* ${place}\n*Message:* ${message}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View in Website' },
                  url: `https://yourwebsite.com/applications/${encodeURIComponent(email)}`,
                  action_id: 'open_in_website'
                }
              ]
            }
          ]
        }
      });
      return res.send();
    }

    // Other block actions (assign, countersign, etc.)
  if (payload.type === 'block_actions') {
    const action = payload.actions[0];
    const slackTs = payload.message && payload.message.ts;
    const channel = payload.channel && payload.channel.id;
    const user = payload.user.id;

    if (!slackTs || !channel) {
      console.error('Missing slackTs or channel in block_actions payload:', payload);
      return res.send();
    }

    if (action.action_id === 'reply_to_thread') {
      await slack.views.open({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'reply_modal',
          title: { type: 'plain_text', text: 'Reply to Thread' },
          submit: { type: 'plain_text', text: 'Send' },
          close: { type: 'plain_text', text: 'Cancel' },
          private_metadata: JSON.stringify({ channel, slackTs }),
          blocks: [
            {
              type: 'input',
              block_id: 'reply_block',
              label: { type: 'plain_text', text: 'Your reply' },
              element: {
                type: 'plain_text_input',
                action_id: 'reply_input',
                multiline: true
              }
            }
          ]
        }
      });
      return res.send();
    }

      if (action.action_id === 'assign_to_user' && payload.message.blocks.some(b => b.elements && b.elements.some(e => e.action_id === 'assign_to_user'))) {
        // Only allow admin to assign
        const userRecord = await User.findOne({ slackId: payload.user.id });
        if (!userRecord || !userRecord.isAdmin) {
          await slack.chat.postEphemeral({
            channel: payload.channel.id,
            user: payload.user.id,
            text: 'Only the admin can assign messages.'
          });
          return res.send();
        }
        let name = '', email = '', phone = '', place = '', message = '', type = 'chat_leads';
        for (const block of payload.message.blocks) {
          if (block.fields) {
            for (const field of block.fields) {
              if (field.text.startsWith('*Name:*')) name = field.text.split('\n')[1];
              if (field.text.startsWith('*Phone #:*')) phone = field.text.split('\n')[1];
              if (field.text.startsWith('*eMail:*')) email = field.text.split('\n')[1];
              if (field.text.startsWith('*Place:*')) place = field.text.split('\n')[1];
            }
          }
          if (block.type === 'section' && block.text && block.text.text.startsWith('*Chat:*')) {
            message = block.text.text.replace('*Chat:*\n', '');
          }
          if (block.type === 'context' && block.elements && block.elements[0] && block.elements[0].text) {
            if (block.elements[0].text.includes('Chat Leads')) type = 'chat_leads';
            else if (block.elements[0].text.includes('Schedule a Tour')) type = 'schedule_tour';
            else if (block.elements[0].text.includes('Application Review')) type = 'applications';
          }
        }
        // Always open the assign modal, regardless of type
        const eligibleUsers = await User.find({ [`preferences.${type}`]: true });
        if (eligibleUsers.length === 0) {
          await slack.chat.postEphemeral({
            channel: payload.channel.id,
            user: payload.user.id,
            text: `No team members have ${type} messages enabled in their preferences.`
          });
          return res.send();
        }
        const userOptions = eligibleUsers.map(user => ({
          text: { type: 'plain_text', text: user.name || user.slackId },
          value: user.slackId
        }));
      await slack.views.open({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'assign_modal',
            title: { type: 'plain_text', text: 'Assign to Team Member' },
          submit: { type: 'plain_text', text: 'Assign' },
          close: { type: 'plain_text', text: 'Cancel' },
            private_metadata: JSON.stringify({
              channel,
              slackTs,
              name,
              email,
              phone,
              place,
              message,
              type
            }),
          blocks: [
            {
              type: 'input',
              block_id: 'assign_block',
                label: { type: 'plain_text', text: 'Select a team member' },
              element: {
                type: 'static_select',
                action_id: 'assign_user_select',
                  placeholder: { type: 'plain_text', text: 'Choose a team member' },
                options: userOptions
              }
            }
          ]
        }
      });
      return res.send();
    }

      if (action.action_id === 'approve_application' || action.action_id === 'reject_application') {
        const decision = action.action_id === 'approve_application' ? 'Accepted' : 'Rejected';
        const decisionText = `*${decision} by <@${payload.user.id}>*`;

        const updatedBlocks = payload.message.blocks.map(block => {
          if (block.type === 'actions' && block.elements.some(el => el.action_id === 'approve_application' || el.action_id === 'reject_application')) {
            return {
              type: 'section',
              text: { type: 'mrkdwn', text: decisionText }
            };
          }
          return block;
        });

        await slack.chat.update({
          channel: payload.channel.id,
          ts: payload.message.ts,
          blocks: updatedBlocks
        });

        let applicantEmail = action.value;
        if (!applicantEmail) {
          for (const block of payload.message.blocks) {
            if (block.fields) {
              for (const field of block.fields) {
                if (field.text && field.text.startsWith('*eMail:*')) {
                  applicantEmail = field.text.split('\n')[1].trim();
                }
              }
            }
          }
        }
        if (applicantEmail) {
          try {
            const userInfo = await slack.users.lookupByEmail({ email: applicantEmail });
            const applicantId = userInfo.user.id;
            const dm = await slack.conversations.open({ users: applicantId });
            await slack.chat.postMessage({
              channel: dm.channel.id,
              text: `Your application has been *${decision.toLowerCase()}* by <@${payload.user.id}>.`
            });
          } catch (e) {
            console.error('Could not send DM to applicant:', e.message);
          }
        }

        return res.send();
      }
    }

    // Default: always send a response
    return res.send();
  });

  // API routes
app.use('/api/assignment', express.json(), express.urlencoded({ extended: true }), assignmentRoutes)
app.use('/api/slack', express.json(), express.urlencoded({ extended: true }), slackRoutes)

  // Event handlers
slackEvents.on('app_home_opened', async (event) => {
  console.log('App home opened by user:', event.user)
  const assignments = await Assignment.find({ assignedTo: event.user })
  await publishHome(event.user, assignments)
})

  // Start server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})();