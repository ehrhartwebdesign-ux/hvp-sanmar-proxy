'use strict';
const express    = require('express');
const nodemailer = require('nodemailer');
const db         = require('../db');
const { requireAuth } = require('../middleware/auth');
const router     = express.Router();

// POST /api/email/send
// Body: { quote_id, from_email, from_password, to_email, subject, body_html, pdf_b64, pdf_filename }
router.post('/send', requireAuth, async function(req, res) {
  try {
    const { quote_id, from_email, from_password, to_email, subject, body_html, pdf_b64, pdf_filename } = req.body;
    if (!from_email || !from_password || !to_email) {
      return res.status(400).json({ error: 'from_email, from_password, and to_email required' });
    }

    // Create Outlook/Office365 SMTP transporter using employee's own credentials
    var transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: from_email, pass: from_password },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
    });

    var mailOptions = {
      from: from_email,
      to: to_email,
      subject: subject || 'Your Quote from Hudson Valley Promos',
      html: body_html || '<p>Please find your quote attached.</p>',
    };

    if (pdf_b64) {
      mailOptions.attachments = [{
        filename: pdf_filename || 'HVP_Quote.pdf',
        content: pdf_b64,
        encoding: 'base64',
        contentType: 'application/pdf'
      }];
    }

    await transporter.sendMail(mailOptions);

    // Log it
    if (quote_id) {
      await db.query(
        'INSERT INTO email_log (quote_id,sent_by,recipient,subject,success) VALUES ($1,$2,$3,$4,true)',
        [quote_id, req.employee.id, to_email, subject]
      );
      await db.query(
        'UPDATE quotes SET emailed_at=NOW(), status=CASE WHEN status=\'draft\' THEN \'sent\' ELSE status END WHERE id=$1',
        [quote_id]
      );
    }

    res.json({ ok: true, message: 'Email sent from ' + from_email });
  } catch(e) {
    // Log failure
    if (req.body.quote_id) {
      await db.query(
        'INSERT INTO email_log (quote_id,sent_by,recipient,subject,success,error_msg) VALUES ($1,$2,$3,$4,false,$5)',
        [req.body.quote_id, req.employee.id, req.body.to_email, req.body.subject, e.message]
      ).catch(function(){});
    }
    var hint = '';
    if (e.message.includes('535') || e.message.includes('auth')) {
      hint = ' Your Outlook password may be wrong, or you may need to use an App Password if MFA is enabled.';
    }
    res.status(500).json({ error: e.message + hint });
  }
});

// GET /api/email/test-smtp — verify SMTP credentials without sending
router.post('/test-smtp', requireAuth, async function(req, res) {
  try {
    const { from_email, from_password } = req.body;
    var transporter = nodemailer.createTransport({
      host: 'smtp.office365.com', port: 587, secure: false,
      auth: { user: from_email, pass: from_password },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
    });
    await transporter.verify();
    res.json({ ok: true, message: 'Outlook SMTP credentials valid.' });
  } catch(e) {
    var hint = '';
    if (e.message.includes('535') || e.message.includes('auth')) {
      hint = ' If MFA is enabled on your account, you need to create an App Password in Microsoft account security settings and use that instead of your regular password.';
    }
    res.json({ ok: false, error: e.message + hint });
  }
});

module.exports = router;
