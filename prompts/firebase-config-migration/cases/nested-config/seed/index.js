const functions = require('firebase-functions');

// Complex nested configuration access
const config = functions.config();

// Database configuration
const dbConfig = config.database;
const dbHost = dbConfig.host;
const dbPort = dbConfig.port;
const dbName = dbConfig.name;
const dbUser = dbConfig.credentials.user;
const dbPassword = dbConfig.credentials.password;

// External services
const services = config.services || {};
const twilioSid = services.twilio?.account_sid;
const twilioToken = services.twilio?.auth_token;
const slackWebhook = services.slack?.webhook_url;

// Feature flags  
const features = config.features || {};
const enableNotifications = features.notifications?.enabled === 'true';
const notificationChannels = features.notifications?.channels || ['email'];
const enableAnalytics = features.analytics?.enabled !== 'false';

exports.connectDatabase = functions.https.onRequest(async (req, res) => {
  const connectionString = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
  
  console.log('Connecting to database...');
  // Database connection logic here
  
  res.json({ 
    status: 'connected',
    host: dbHost,
    database: dbName 
  });
});

exports.sendNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    if (!enableNotifications) {
      console.log('Notifications are disabled');
      return;
    }
    
    const notification = snap.data();
    
    if (notificationChannels.includes('sms') && twilioSid && twilioToken) {
      const twilio = require('twilio')(twilioSid, twilioToken);
      // Send SMS logic
    }
    
    if (notificationChannels.includes('slack') && slackWebhook) {
      // Send Slack notification
    }
    
    if (enableAnalytics) {
      // Track notification event
      console.log('Analytics: Notification sent');
    }
  });