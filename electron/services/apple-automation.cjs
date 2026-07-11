const { spawn } = require('node:child_process');

const SCRIPTS = Object.freeze({
  createReminder: `function run(argv) {
    const app = Application('Reminders');
    const lists = app.lists(); if (!lists.length) throw new Error('No Reminders list is available.');
    const properties = { name: argv[0] };
    if (argv[1]) properties.dueDate = new Date(argv[1]);
    lists[0].reminders.push(app.Reminder(properties));
    return 'Saved reminder "' + argv[0] + '".';
  }`,
  createCalendarEvent: `function run(argv) {
    const app = Application('Calendar');
    const calendars = app.calendars(); if (!calendars.length) throw new Error('No writable calendar is available.');
    const start = new Date(argv[1]);
    const end = argv[2] ? new Date(argv[2]) : new Date(start.getTime() + 3600000);
    calendars[0].events.push(app.Event({ summary: argv[0], startDate: start, endDate: end }));
    return 'Saved calendar event "' + argv[0] + '".';
  }`,
  upcoming: `function run(argv) {
    const app = Application('Calendar'); const now = new Date(); const end = new Date(now.getTime() + Number(argv[0] || 604800000));
    const found = [];
    app.calendars().forEach(calendar => calendar.events().forEach(event => {
      const start = event.startDate(); if (start >= now && start <= end) found.push({ title: event.summary(), start: start.toISOString(), calendar: calendar.name() });
    }));
    found.sort((a,b) => a.start.localeCompare(b.start)); return JSON.stringify(found.slice(0, 30));
  }`,
  sendEmail: `function run(argv) {
    const app = Application('Mail');
    const message = app.OutgoingMessage({ subject: argv[1], content: argv[2], visible: false });
    message.toRecipients.push(app.ToRecipient({ address: argv[0] }));
    app.outgoingMessages.push(message); message.send(); return 'Email sent to ' + argv[0] + '.';
  }`,
  draftEmail: `function run(argv) {
    const app = Application('Mail'); app.activate();
    const message = app.OutgoingMessage({ subject: argv[1], content: argv[2], visible: true });
    message.toRecipients.push(app.ToRecipient({ address: argv[0] })); app.outgoingMessages.push(message);
    return 'Email draft opened for ' + argv[0] + '.';
  }`,
  sendMessage: `function run(argv) {
    const app = Application('Messages');
    const services = app.services.whose({ serviceType: 'iMessage' });
    if (!services.length) throw new Error('No iMessage service is signed in.');
    const buddy = services[0].buddies.byName(argv[0]);
    app.send(argv[1], { to: buddy });
    return 'Message sent to ' + argv[0] + '.';
  }`,
  createAppleNote: `function run(argv) {
    const app = Application('Notes'); app.activate();
    const account = app.defaultAccount();
    const folder = account.defaultFolder();
    folder.notes.push(app.Note({ name: argv[0], body: argv[1] || argv[0] }));
    return 'Apple Note created: ' + argv[0] + '.';
  }`
});

function runJXA(script, args = [], timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, ...args.map(value => String(value ?? ''))], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; const append = chunk => { output = (output + chunk.toString()).slice(-32_000); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Apple app automation timed out.')); }, timeout);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(output.trim() || `Apple automation exited with status ${code}.`)); });
  });
}

class AppleAutomationService {
  createReminder(title, date) { return runJXA(SCRIPTS.createReminder, [title, date || '']); }
  createCalendarEvent(title, start, end) {
    if (!start || Number.isNaN(new Date(start).getTime())) throw new Error('Choose a valid event date and time.');
    return runJXA(SCRIPTS.createCalendarEvent, [title, start, end || '']);
  }
  async upcoming(range = 'upcoming') {
    const duration = range === 'tomorrow' ? 172800000 : 604800000;
    const output = await runJXA(SCRIPTS.upcoming, [duration]);
    const events = JSON.parse(output || '[]');
    return events.length ? events.map(item => `${new Date(item.start).toLocaleString()} — ${item.title} (${item.calendar})`).join('\n') : 'No upcoming events found.';
  }
  sendEmail(to, subject, body) { return runJXA(SCRIPTS.sendEmail, [to, subject, body]); }
  draftEmail(to, subject, body) { return runJXA(SCRIPTS.draftEmail, [to, subject, body]); }
  sendMessage(to, body) { return runJXA(SCRIPTS.sendMessage, [to, body]); }
  createAppleNote(title, body) { return runJXA(SCRIPTS.createAppleNote, [title, body || '']); }
}

module.exports = { AppleAutomationService, runJXA, SCRIPTS };
