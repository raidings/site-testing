const MAX_NAME = 120;
const MAX_COMPANY = 160;
const MAX_MESSAGE = 5000;

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = req.body || {};
  const honeypot = clean(body.website, 200);

  // Quietly accept obvious bot submissions without sending email.
  if (honeypot) return res.status(200).json({ ok: true });

  const name = clean(body.name, MAX_NAME);
  const company = clean(body.company, MAX_COMPANY);
  const email = clean(body.email, 254).toLowerCase();
  const message = clean(body.message, MAX_MESSAGE);

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and request details are required.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL || 'contact@american-airflow.com';
  const fromEmail = process.env.CONTACT_FROM_EMAIL || 'American Air Flow Website <website@american-airflow.com>';

  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured.');
    return res.status(500).json({ error: 'Contact form email is not configured yet.' });
  }

  const safe = {
    name: escapeHtml(name),
    company: escapeHtml(company || 'Not provided'),
    email: escapeHtml(email),
    message: escapeHtml(message).replaceAll('\n', '<br>')
  };

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject: `Certification request — ${name}${company ? ` / ${company}` : ''}`.slice(0, 180),
        text: [
          'New American Air Flow website request',
          '',
          `Name: ${name}`,
          `Company: ${company || 'Not provided'}`,
          `Email: ${email}`,
          '',
          'Request:',
          message
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#102a43">
            <h2 style="color:#062b55">New certification request</h2>
            <p><strong>Name:</strong> ${safe.name}</p>
            <p><strong>Company:</strong> ${safe.company}</p>
            <p><strong>Email:</strong> <a href="mailto:${safe.email}">${safe.email}</a></p>
            <hr style="border:0;border-top:1px solid #dbe4ee;margin:24px 0">
            <p><strong>Request:</strong></p>
            <p style="line-height:1.6">${safe.message}</p>
          </div>`
      })
    });

    const payload = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      console.error('Resend error:', payload);
      return res.status(502).json({ error: 'Email delivery failed. Please try again or email us directly.' });
    }

    return res.status(200).json({ ok: true, id: payload.id || null });
  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({ error: 'Unable to send your request right now.' });
  }
}
