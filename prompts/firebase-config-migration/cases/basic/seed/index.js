const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Get configuration
const config = functions.config();
const stripeKey = config.stripe.key;
const stripeWebhookSecret = config.stripe.webhook_secret;
const sendgridKey = config.sendgrid.api_key;
const appUrl = config.app.url;
const debugMode = config.app.debug === 'true';

exports.processPayment = functions.https.onRequest(async (req, res) => {
  const stripe = require('stripe')(stripeKey);
  
  try {
    // Verify webhook signature
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      stripeWebhookSecret
    );
    
    // Process payment event
    console.log('Processing payment event:', event.type);
    
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

exports.sendEmail = functions.firestore
  .document('emails/{emailId}')
  .onCreate(async (snap, context) => {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(sendgridKey);
    
    const emailData = snap.data();
    const msg = {
      to: emailData.to,
      from: `noreply@${appUrl}`,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
    };
    
    if (debugMode) {
      console.log('Debug mode - would send email:', msg);
      return;
    }
    
    try {
      await sgMail.send(msg);
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  });

exports.cleanupOldData = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const retention = config.cleanup?.retention_days || '30';
    const retentionDays = parseInt(retention);
    
    console.log(`Cleaning up data older than ${retentionDays} days`);
    
    // Cleanup logic here
    
    return null;
  });