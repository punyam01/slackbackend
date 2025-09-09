// Generates the Home tab view for a user
function getHomeView(assignments = [], preferences = {
  chat_leads: true,
  schedule_tour: true,
  applications: false
}, isAdmin = false) {
  console.log('Generating home view with preferences:', preferences)
  
  // Color and label for each type
  const typeLabels = {
    chat_leads: { text: 'Chat Leads', color: '#e01e5a' },
    schedule_tour: { text: 'Schedule a Tour', color: '#eab308' },
    applications: { text: 'Applications', color: '#36c5f0' }
  };

  // Create fresh option objects each time to avoid reference issues
  const createOptions = () => [
    {
      text: { type: 'plain_text', text: 'Enable Chat Leads' },
      value: 'chat_leads'
    },
    {
      text: { type: 'plain_text', text: 'Enable Schedule a Tour' },
      value: 'schedule_tour'
    },
    {
      text: { type: 'plain_text', text: 'Enable Applications' },
      value: 'applications'
    }
  ];

  const allOptions = createOptions();
  const initialOptions = [];
  
  // Build initial options based on preferences
  if (preferences.chat_leads === true) {
    initialOptions.push(allOptions[0]);
  }
  if (preferences.schedule_tour === true) {
    initialOptions.push(allOptions[1]);
  }
  if (preferences.applications === true) {
    initialOptions.push(allOptions[2]);
  }

  console.log('Initial options being set:', initialOptions.map(opt => opt.value));

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Homework Notification Preferences' }
    },
    // Notification block
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: isAdmin ? ':star: You are the admin. Changes here affect all users.' : ':lock: Only the admin can change preferences.' }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Collect and manage conversations from prospective tenants seamlessly in your Slack app.*\n• Turn chat interactions into valuable leads for your property management team.\n• Teams can assign chat leads to themselves or others.\n• Schedule a tour request. Teams can assign that lead to themselves or others.\n• Review (approve or disapprove | countersigning) applications from prospective applicants.'
      }
    },
    {
      type: 'divider'
    },
    // Preferences section with unique block_id
    {
      type: 'section',
      block_id: 'preferences_section',
      text: { type: 'mrkdwn', text: '*Notification Preferences*' },
      accessory: {
        type: 'checkboxes',
        action_id: 'toggle_preferences',
        options: allOptions,
        ...(initialOptions.length > 0 ? { initial_options: initialOptions } : {})
      }
    },
    {
      type: 'divider'
    },
    // Save preferences button
    {
      type: 'actions',
      block_id: 'save_section',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Save your preferences' },
          action_id: 'open_preferences_modal',
          style: 'primary'
        }
      ]
    }
  ];

  return {
    type: 'home',
    blocks
  }
}

module.exports = { getHomeView }