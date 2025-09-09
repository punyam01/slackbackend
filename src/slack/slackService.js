const { WebClient } = require('@slack/web-api')
const { createEventAdapter } = require('@slack/events-api')
const { getHomeView } = require('./homeView')
const slack = new WebClient(process.env.SLACK_BOT_TOKEN)
const User = require('../db/User')

const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET)

async function publishHome(userId, assignments) {
  console.log('Publishing home for user:', userId);
  assignments = Array.isArray(assignments) ? assignments : [];
  console.log('Assignments received in publishHome:', assignments);
  // Fetch user preferences from DB
  let preferences = { chat_leads: true, schedule_tour: true, applications: false };
  let isAdmin = false;
  try {
    const user = await User.findOne({ slackId: userId });
    if (user && user.preferences) {
      preferences = {
        chat_leads: user.preferences.chat_leads !== undefined ? user.preferences.chat_leads : true,
        schedule_tour: user.preferences.schedule_tour !== undefined ? user.preferences.schedule_tour : true,
        applications: user.preferences.applications !== undefined ? user.preferences.applications : false
      };
      isAdmin = !!user.isAdmin;
      console.log('Loaded user preferences from DB:', userId, preferences);
    } else {
      // If no prefs, save defaults
      await User.findOneAndUpdate(
        { slackId: userId },
        { preferences },
        { new: true, upsert: true }
      );
      console.log('No user found, saved default preferences:', userId, preferences);
    }
  } catch (e) {
    console.error('Error fetching/saving user preferences:', e);
    // fallback to defaults
  }

  // Filter assignments/messages based on preferences
  const allowedTypes = [];
  if (preferences.chat_leads) allowedTypes.push('chat_leads');
  if (preferences.schedule_tour) allowedTypes.push('schedule_tour');
  if (preferences.applications) allowedTypes.push('applications');
  const filteredAssignments = assignments.filter(a => allowedTypes.includes(a.type));

  console.log('Final preferences being used:', preferences);

  try {
    const homeView = getHomeView(filteredAssignments, preferences, isAdmin);
    console.log('Home view generated, publishing...');

    const result = await slack.views.publish({
      user_id: userId,
      view: homeView
    });

    console.log('Home view published successfully for user:', userId);
    return result;
  } catch (error) {
    console.error('Error publishing home view:', error);
    throw error;
  }
}

async function postMessageToHomework(blocks) {
  return slack.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_HOMEWORK,
    ...blocks
  })
}

async function postThreadReply(channel, thread_ts, text) {
  return slack.chat.postMessage({
    channel,
    thread_ts,
    text
  });
}

async function getChannelMembers() {
  const res = await slack.conversations.members({
    channel: process.env.SLACK_CHANNEL_HOMEWORK
  })
  return res.members
}

module.exports = {
  slack,
  slackEvents,
  publishHome,
  postMessageToHomework,
  postThreadReply,
  getChannelMembers
}