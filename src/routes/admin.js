const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

const { pool } = require('../db');
const { ensureAuthenticated } = require('../middleware/auth');
const { sanitizeText, isValidUrl, normalizeArray, isValidEmail } = require('../utils/validators');

const router = express.Router();
const uploadDir = path.resolve(__dirname, '../../storage/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_SIZE || 5242880) },
});

function validateUploadedImage(buffer) {
  const signatures = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpeg: [0xff, 0xd8, 0xff],
    gif: [0x47, 0x49, 0x46, 0x38],
    webp: [0x52, 0x49, 0x46, 0x46],
  };

  const matches = Object.entries(signatures).some(([type, sig]) => sig.every((byte, idx) => buffer[idx] === byte));
  return matches;
}

router.post('/uploads', (req, res, next) => {
  upload.single('image')(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        return res.status(400).json({ success: false, message: uploadError.message || 'Upload failed.' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image file provided.' });
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const allowedMime = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

      if (!allowedMime.includes(req.file.mimetype) || !validateUploadedImage(fileBuffer)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'Unsupported or invalid image file.' });
      }

      const fileUrl = `/uploads/${path.basename(req.file.path)}`;
      const saveResult = await pool.query(
        `INSERT INTO uploads (filename, original_name, mime_type, size_bytes, url) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [path.basename(req.file.path), req.file.originalname, req.file.mimetype, req.file.size, fileUrl]
      );

      res.status(201).json({ success: true, data: { url: fileUrl, id: saveResult.rows[0].id } });
    } catch (error) {
      next(error);
    }
  });
});

router.use(ensureAuthenticated);

router.get('/overview', async (req, res, next) => {
  try {
    const [projectCount, unreadCount, totalContacts, totalProjects] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM projects'),
      pool.query("SELECT COUNT(*)::int AS count FROM contacts WHERE status = 'new'"),
      pool.query('SELECT COUNT(*)::int AS count FROM contacts'),
      pool.query('SELECT COUNT(*)::int AS count FROM projects WHERE published = true'),
    ]);

    res.json({
      success: true,
      data: {
        projectCount: projectCount.rows[0].count,
        unreadContactCount: unreadCount.rows[0].count,
        totalContacts: totalContacts.rows[0].count,
        publishedProjects: totalProjects.rows[0].count,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/projects', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name AS category_name
      FROM projects p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/projects',
  [
    body('title').trim().isLength({ min: 2, max: 200 }).withMessage('Title is required.'),
    body('slug').trim().isLength({ min: 2, max: 140 }).withMessage('Slug is required.'),
    body('shortDescription').trim().isLength({ min: 10, max: 280 }).withMessage('Short description is required.'),
    body('description').trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters.'),
    body('imageUrl').optional({ checkFalsy: true }).isURL().withMessage('Image URL must be valid.'),
    body('liveUrl').optional({ checkFalsy: true }).isURL().withMessage('Live URL must be valid.'),
    body('repoUrl').optional({ checkFalsy: true }).isURL().withMessage('Repository URL must be valid.'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
      }

      const title = sanitizeText(req.body.title, 200);
      const slug = sanitizeText(req.body.slug, 140).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const shortDescription = sanitizeText(req.body.shortDescription, 280);
      const description = sanitizeText(req.body.description, 8000);
      const imageUrl = sanitizeText(req.body.imageUrl || '', 500);
      const liveUrl = sanitizeText(req.body.liveUrl || '', 500);
      const repoUrl = sanitizeText(req.body.repoUrl || '', 500);
      const technologies = normalizeArray(req.body.technologies);
      const featured = Boolean(req.body.featured);
      const published = Boolean(req.body.published);
      const categoryName = sanitizeText(req.body.category || 'General', 120);
      const categorySlug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const categoryResult = await pool.query(
        `INSERT INTO categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [categoryName, categorySlug]
      );

      const categoryId = categoryResult.rows[0].id;

      const result = await pool.query(
        `
          INSERT INTO projects (slug, title, short_description, description, image_url, technologies, category_id, live_url, repo_url, featured, published)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `,
        [slug, title, shortDescription, description, imageUrl || null, technologies, categoryId, liveUrl || null, repoUrl || null, featured, published]
      );

      res.status(201).json({ success: true, message: 'Project created.', data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/projects/:id',
  [
    body('title').optional().trim().isLength({ min: 2, max: 200 }).withMessage('Title is required.'),
    body('description').optional().trim().isLength({ min: 20 }).withMessage('Description must be at least 20 characters.'),
  ],
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.id);
      if (!projectId) {
        return res.status(400).json({ success: false, message: 'Valid project ID required.' });
      }

      const existing = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      if (!existing.rows.length) {
        return res.status(404).json({ success: false, message: 'Project not found.' });
      }

      const nextData = {
        slug: sanitizeText(req.body.slug || existing.rows[0].slug, 140).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        title: sanitizeText(req.body.title || existing.rows[0].title, 200),
        shortDescription: sanitizeText(req.body.shortDescription || existing.rows[0].short_description, 280),
        description: sanitizeText(req.body.description || existing.rows[0].description, 8000),
        imageUrl: sanitizeText(req.body.imageUrl || existing.rows[0].image_url || '', 500),
        liveUrl: sanitizeText(req.body.liveUrl || existing.rows[0].live_url || '', 500),
        repoUrl: sanitizeText(req.body.repoUrl || existing.rows[0].repo_url || '', 500),
        featured: Boolean(req.body.featured ?? existing.rows[0].featured),
        published: Boolean(req.body.published ?? existing.rows[0].published),
        technologies: normalizeArray(req.body.technologies || existing.rows[0].technologies),
      };

      const categoryName = sanitizeText(req.body.category || 'General', 120);
      const categorySlug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const categoryResult = await pool.query(
        `INSERT INTO categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [categoryName, categorySlug]
      );

      const result = await pool.query(
        `
          UPDATE projects
          SET slug = $1,
              title = $2,
              short_description = $3,
              description = $4,
              image_url = $5,
              technologies = $6,
              category_id = $7,
              live_url = $8,
              repo_url = $9,
              featured = $10,
              published = $11,
              updated_at = NOW()
          WHERE id = $12
          RETURNING *
        `,
        [nextData.slug, nextData.title, nextData.shortDescription, nextData.description, nextData.imageUrl || null, nextData.technologies, categoryResult.rows[0].id, nextData.liveUrl || null, nextData.repoUrl || null, nextData.featured, nextData.published, projectId]
      );

      res.json({ success: true, message: 'Project updated.', data: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/projects/:id', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [projectId]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    res.json({ success: true, message: 'Project deleted.' });
  } catch (error) {
    next(error);
  }
});

router.get('/skills', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM skills ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/skills', async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name, 120);
    const level = sanitizeText(req.body.level || 'Advanced', 50);
    const category = sanitizeText(req.body.category || 'General', 80);

    if (!name) {
      return res.status(400).json({ success: false, message: 'Skill name is required.' });
    }

    const result = await pool.query(
      'INSERT INTO skills (name, level, category) VALUES ($1, $2, $3) RETURNING *',
      [name, level, category]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/experience', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM experiences ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/experience', async (req, res, next) => {
  try {
    const role = sanitizeText(req.body.role, 160);
    const company = sanitizeText(req.body.company, 160);
    const period = sanitizeText(req.body.period, 80);
    const description = sanitizeText(req.body.description, 4000);
    const current = Boolean(req.body.current);

    if (!role || !company || !period || !description) {
      return res.status(400).json({ success: false, message: 'Role, company, period, and description are required.' });
    }

    const result = await pool.query(
      'INSERT INTO experiences (role, company, period, description, current) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [role, company, period, description, current]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/testimonials', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM testimonials ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/testimonials', async (req, res, next) => {
  try {
    const author = sanitizeText(req.body.author, 120);
    const role = sanitizeText(req.body.role || '', 120);
    const quote = sanitizeText(req.body.quote, 1000);

    if (!author || !quote) {
      return res.status(400).json({ success: false, message: 'Author and quote are required.' });
    }

    const result = await pool.query(
      'INSERT INTO testimonials (author, role, quote, published) VALUES ($1, $2, $3, $4) RETURNING *',
      [author, role, quote, Boolean(req.body.published)]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.patch('/messages/:id/read', async (req, res, next) => {
  try {
    const messageId = Number(req.params.id);
    const result = await pool.query(
      `UPDATE contacts SET status = 'read', read_at = NOW() WHERE id = $1 RETURNING *`,
      [messageId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/messages/:id', async (req, res, next) => {
  try {
    const messageId = Number(req.params.id);
    const result = await pool.query('DELETE FROM contacts WHERE id = $1 RETURNING *', [messageId]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    res.json({ success: true, message: 'Message deleted.' });
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const queries = await Promise.all([
      pool.query("SELECT event_type, COUNT(*)::int AS count FROM analytics_events GROUP BY event_type ORDER BY count DESC"),
      pool.query("SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::int AS count FROM analytics_events GROUP BY DATE_TRUNC('day', created_at) ORDER BY day DESC LIMIT 14"),
      pool.query("SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)::int AS count FROM analytics_events GROUP BY DATE_TRUNC('month', created_at) ORDER BY month DESC LIMIT 12"),
    ]);

    res.json({
      success: true,
      data: {
        byType: queries[0].rows,
        byDay: queries[1].rows,
        byMonth: queries[2].rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('dannix.sid');
    res.json({ success: true, message: 'Logged out.' });
  });
});

module.exports = router;
