const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineString, defineSecret } = require('firebase-functions/params');

admin.initializeApp();

// Define configuration parameters
const stripeKey = defineSecret('STRIPE_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const sendgridKey = defineSecret('SENDGRID_API_KEY');
const appUrl = defineString('APP_URL');
const debugMode = defineString('APP_DEBUG', { default: 'false' });
const cleanupRetentionDays = defineString('CLEANUP_RETENTION_DAYS', { default: '30' });

exports.processPayment = functions.https.onRequest(async (req, res) => {
  const stripe = require('stripe')(stripeKey.value());
  
  try {
    // Verify webhook signature
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      stripeWebhookSecret.value()
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
    sgMail.setApiKey(sendgridKey.value());
    
    const emailData = snap.data();
    const msg = {
      to: emailData.to,
      from: `noreply@${appUrl.value()}`,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
    };
    
    if (debugMode.value() === 'true') {
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
    const retentionDays = parseInt(cleanupRetentionDays.value());
    
    console.log(`Cleaning up data older than ${retentionDays} days`);
    
    // Cleanup logic here
    
    return null;
  });