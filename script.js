const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.main-nav');

if (navToggle && navMenu) {
  const closeMenu = () => {
    navMenu.classList.remove('is-open');
    navToggle.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Open navigation menu');
  };

  navToggle.addEventListener('click', () => {
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isExpanded));
    navToggle.setAttribute('aria-label', isExpanded ? 'Open navigation menu' : 'Close navigation menu');
    navMenu.classList.toggle('is-open', !isExpanded);
    navToggle.classList.toggle('is-open', !isExpanded);
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navMenu.classList.contains('is-open')) {
      closeMenu();
      navToggle.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      closeMenu();
    }
  });
}

const contactForm = document.getElementById('contact-form');
const contactStatus = document.getElementById('contact-status');

if (contactForm && !contactForm.action.includes('formspree.io')) {
  let isSubmitting = false;

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const formData = new FormData(contactForm);
    const payload = {
      name: (formData.get('name') || '').toString().trim(),
      email: (formData.get('email') || '').toString().trim(),
      subject: (formData.get('subject') || '').toString().trim(),
      message: (formData.get('message') || '').toString().trim(),
      website: (formData.get('website') || '').toString().trim(),
    };

    if (!payload.name || !payload.email || !payload.subject || !payload.message) {
      if (contactStatus) {
        contactStatus.textContent = 'Please complete all required fields.';
        contactStatus.className = 'form-status error';
      }
      return;
    }

    if (payload.website) {
      if (contactStatus) {
        contactStatus.textContent = 'Request rejected.';
        contactStatus.className = 'form-status error';
      }
      return;
    }

    isSubmitting = true;
    const submitButton = document.getElementById('contact-submit');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    if (contactStatus) {
      contactStatus.textContent = 'Sending your message...';
      contactStatus.className = 'form-status';
    }

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Unable to send your message right now.');
      }

      contactForm.reset();
      if (contactStatus) {
        contactStatus.textContent = result.message || 'Your message was sent successfully.';
        contactStatus.className = 'form-status success';
      }
    } catch (error) {
      if (contactStatus) {
        contactStatus.textContent = error.message;
        contactStatus.className = 'form-status error';
      }
    } finally {
      isSubmitting = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Send message';
      }
    }
  });
}

const cards = document.querySelectorAll('.model-card');
cards.forEach((card) => {
  card.addEventListener('mouseenter', () => {
    cards.forEach((item) => item.classList.remove('active'));
    card.classList.add('active');
  });

  card.addEventListener('focusin', () => {
    cards.forEach((item) => item.classList.remove('active'));
    card.classList.add('active');
  });
});
