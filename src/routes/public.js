const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

const { pool } = require('../db');
const { sanitizeText, isValidEmail, isValidUrl, normalizeArray } = require('../utils/validators');
const { sendContactNotification } = require('../services/email');

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many contact submissions. Please try again later.' },
});

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many analytics requests.' },
});

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API healthy', timestamp: new Date().toISOString() });
});

router.get('/projects', async (req, res, next) => {
  try {
    const { category, featured, page = '1', limit = '12' } = req.query;
    const pageNumber = Number(page) > 0 ? Number(page) : 1;
    const pageSize = Number(limit) > 0 ? Math.min(Number(limit), 50) : 12;
    const offset = (pageNumber - 1) * pageSize;

    let query = `
      SELECT p.*, c.name AS category_name
      FROM projects p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.published = true
    `;
    const params = [];

    if (category) {
      query += ' AND c.slug = $1';
      params.push(sanitizeText(category, 80));
    }

    if (featured === 'true') {
      query += ' AND p.featured = true';
    }

    query += ` ORDER BY p.featured DESC, p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: result.rows.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/contact',
  contactLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters.'),
    body('email').trim().isEmail().withMessage('A valid email is required.'),
    body('subject').trim().isLength({ min: 3, max: 200 }).withMessage('Subject must be between 3 and 200 characters.'),
    body('message').trim().isLength({ min: 20, max: 2000 }).withMessage('Message must be between 20 and 2000 characters.'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
        });
      }

      const honeypot = sanitizeText(req.body.website || '', 60);
      if (honeypot) {
        return res.status(400).json({ success: false, message: 'Request rejected.' });
      }

      const name = sanitizeText(req.body.name, 120);
      const email = sanitizeText(req.body.email, 255).toLowerCase();
      const subject = sanitizeText(req.body.subject, 200);
      const message = sanitizeText(req.body.message, 2000);

      const duplicate = await pool.query(
        `
          SELECT id
          FROM contacts
          WHERE email = $1 AND subject = $2 AND message = $3 AND created_at > NOW() - INTERVAL '15 minutes'
          LIMIT 1
        `,
        [email, subject, message]
      );

      if (duplicate.rows.length > 0) {
        return res.status(429).json({
          success: false,
          message: 'A similar message was submitted recently. Please wait a moment and try again.',
        });
      }

      const insertResult = await pool.query(
        `
          INSERT INTO contacts (name, email, subject, message, source, status)
          VALUES ($1, $2, $3, $4, 'website', 'new')
          RETURNING id, name, email, subject, message, created_at
        `,
        [name, email, subject, message]
      );

      try {
        await sendContactNotification({ name, email, subject, message });
      } catch (mailError) {
        console.error('Email notification failed:', mailError.message);
      }

      res.status(201).json({
        success: true,
        message: 'Your message has been sent successfully.',
        data: insertResult.rows[0],
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/admin/login', analyticsLimiter, async (req, res, next) => {
  try {
    const username = sanitizeText(req.body.username || '', 80).toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const user = await pool.query('SELECT id, username, password_hash FROM admin_users WHERE username = $1', [username]);
    if (!user.rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    req.session.user = {
      id: user.rows[0].id,
      username: user.rows[0].username,
    };

    res.json({ success: true, message: 'Login successful.', user: { username: user.rows[0].username } });
  } catch (error) {
    next(error);
  }
});

router.post('/analytics', analyticsLimiter, async (req, res, next) => {
  try {
    const eventType = sanitizeText(req.body.eventType || '', 60);
    const page = sanitizeText(req.body.page || '', 160);
    const source = sanitizeText(req.body.source || '', 60);

    if (!['page_view', 'project_click', 'contact_submit'].includes(eventType)) {
      return res.status(400).json({ success: false, message: 'Unsupported event type.' });
    }

    const metadata = {
      user_agent: sanitizeText(req.headers['user-agent'] || '', 180),
      referrer: sanitizeText(req.headers.referer || '', 180),
    };

    await pool.query(
      `INSERT INTO analytics_events (event_type, page, source, metadata) VALUES ($1, $2, $3, $4)`,
      [eventType, page || null, source || null, metadata]
    );

    res.status(201).json({ success: true, message: 'Analytics recorded.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
