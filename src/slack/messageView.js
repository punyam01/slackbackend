function getMessageView({ name, firstName, lastName, email, phone, place, message, type, assignedTo, assignedBy, isAdmin = false }) {
  const typeLabels = {
    chat_leads: { text: ':red_circle: Chat Leads' },
    schedule_tour: { text: ':orange_circle:Schedule a Tour' },
    applications: { text: ':large_blue_circle: Application Review' }
  };
  const label = typeLabels[type] || { text: type };
  const fields = [
    { type: 'mrkdwn', text: `*Name:*\n${name || '(name) or anonymous'}` },
    { type: 'mrkdwn', text: `*Phone #:*\n${phone || '+1 (123) 123-1234'}` },
    { type: 'mrkdwn', text: `*eMail:*\n${email}` },
    { type: 'mrkdwn', text: `*Place:*\n${place || '123 Suffix House'}` }
  ];
  if (type === 'applications') {
    fields[0] = { type: 'mrkdwn', text: `*First Name:*\n${firstName || name.split(' ')[0] || name}` };
    fields.splice(1, 0, { type: 'mrkdwn', text: `*Last Name:*\n${lastName || name.split(' ').slice(1).join(' ') || 'N/A'}` });
    fields.push({ type: 'mrkdwn', text: `*Apt #:*\n###` });
  }
  const blocks = [
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*${label.text}*` }] },
    { type: 'section', fields }
  ];
  if (type === 'applications') {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'Full application can be viewed by clicking the following link:' } });
    if (!(assignedTo && assignedBy)) {
      blocks.push({
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'See full application' }, action_id: 'view_application', style: 'primary', value: email },
          { type: 'button', text: { type: 'plain_text', text: 'please countersign ...' }, action_id: 'countersign_application', value: email, style: 'primary' },
          { type: 'button', text: { type: 'plain_text', text: 'Assign to...' }, action_id: 'assign_to_user', value: email, style: 'primary' }
        ]
      });
    } else {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `assigned by: <@${assignedBy}>  to: <@${assignedTo}>` }] });
      blocks.push({
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'See full application' }, action_id: 'view_application', style: 'primary', value: email },
          { type: 'button', text: { type: 'plain_text', text: 'please countersign ...' }, action_id: 'countersign_application', value: email, style: 'primary' }
        ]
      });
    }
  }
  if (type !== 'applications') {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Chat:*\n${message}` } });
    if (assignedTo && assignedBy) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `assigned by: <@${assignedBy}>  to: <@${assignedTo}>` }] });
    }
    if (!(assignedTo && assignedBy)) {
      blocks.push({
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'assign chat lead to ...' }, action_id: 'assign_to_user', value: email, style: 'primary' }
        ]
      });
    }
  }
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Reply' }, action_id: 'reply_to_thread', value: email, style: 'primary' }
    ]
  });
  const text = `${label.text} from ${name} (${email}): ${message}`;
  return { text, blocks };
}

module.exports = { getMessageView }