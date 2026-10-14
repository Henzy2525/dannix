const state = {
  user: null,
  activeView: 'overview',
  projects: [],
  messages: [],
  analytics: null,
};

const app = {
  loginScreen: document.getElementById('login-screen'),
  overviewScreen: document.getElementById('overview-screen'),
  projectsScreen: document.getElementById('projects-screen'),
  messagesScreen: document.getElementById('messages-screen'),
  analyticsScreen: document.getElementById('analytics-screen'),
  overviewCards: document.getElementById('overview-cards'),
  projectList: document.getElementById('project-list'),
  messageList: document.getElementById('message-list'),
  analyticsPanels: document.getElementById('analytics-panels'),
};

function setStatus(elementId, text, type = '') {
  const node = document.getElementById(elementId);
  if (!node) return;
  node.textContent = text;
  node.className = `status ${type}`.trim();
}

function setScreen(view) {
  state.activeView = view;
  document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
  const map = {
    overview: app.overviewScreen,
    projects: app.projectsScreen,
    messages: app.messagesScreen,
    analytics: app.analyticsScreen,
  };

  if (state.user) {
    map.overview.classList.add('active');
    map.projects.classList.add('active');
    map.messages.classList.add('active');
    map.analytics.classList.add('active');
    app.loginScreen.classList.remove('active');
    document.querySelectorAll('.nav-link').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === view);
    });

    if (view === 'overview') {
      renderOverview();
    }
    if (view === 'projects') {
      loadProjects();
    }
    if (view === 'messages') {
      loadMessages();
    }
    if (view === 'analytics') {
      loadAnalytics();
    }
  } else {
    app.loginScreen.classList.add('active');
    document.querySelectorAll('.nav-link').forEach((button) => button.classList.remove('active'));
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

async function login(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const username = formData.get('username');
  const password = formData.get('password');

  try {
    const payload = await apiRequest('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    state.user = payload.user;
    setStatus('login-status', payload.message || 'Login successful.', 'success');
    setScreen('overview');
  } catch (error) {
    setStatus('login-status', error.message, 'error');
  }
}

async function logout() {
  try {
    await apiRequest('/api/admin/logout', { method: 'POST' });
    state.user = null;
    setScreen('overview');
  } catch (error) {
    console.error(error);
    state.user = null;
    setScreen('overview');
  }
}

async function loadOverview() {
  try {
    const payload = await apiRequest('/api/admin/overview');
    const cards = [
      { label: 'Projects', value: payload.data.projectCount },
      { label: 'Published', value: payload.data.publishedProjects },
      { label: 'Unread messages', value: payload.data.unreadContactCount },
      { label: 'Total messages', value: payload.data.totalContacts },
    ];

    app.overviewCards.innerHTML = cards.map((card) => `
      <article class="stat-card">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
      </article>
    `).join('');
  } catch (error) {
    app.overviewCards.innerHTML = '<article class="stat-card"><span>Error</span><strong>Unable to load overview</strong></article>';
  }
}

function renderOverview() {
  loadOverview();
}

async function loadProjects() {
  try {
    const payload = await apiRequest('/api/admin/projects');
    state.projects = payload.data || [];
    app.projectList.innerHTML = state.projects.length ? state.projects.map((project) => `
      <article class="content-card">
        <h3>${project.title}</h3>
        <p>${project.short_description}</p>
        <div class="meta">
          <span>${project.published ? 'Published' : 'Draft'}</span>
          <span>${project.featured ? 'Featured' : 'Standard'}</span>
          <span>${project.slug}</span>
        </div>
        <div class="form-actions">
          <button class="secondary-btn small" data-action="edit-project" data-id="${project.id}">Edit</button>
          <button class="secondary-btn small" data-action="delete-project" data-id="${project.id}">Delete</button>
        </div>
      </article>
    `).join('') : '<article class="content-card"><p>No projects yet.</p></article>';
  } catch (error) {
    app.projectList.innerHTML = `<article class="content-card"><p>${error.message}</p></article>`;
  }
}

async function loadMessages() {
  try {
    const payload = await apiRequest('/api/admin/messages');
    state.messages = payload.data || [];
    app.messageList.innerHTML = state.messages.length ? state.messages.map((message) => `
      <article class="content-card">
        <h3>${message.name}</h3>
        <p>${message.email}</p>
        <p>${message.subject}</p>
        <p>${message.message}</p>
        <div class="meta">
          <span>${message.status}</span>
          <span>${new Date(message.created_at).toLocaleDateString()}</span>
        </div>
        <div class="form-actions">
          <button class="secondary-btn small" data-action="toggle-read" data-id="${message.id}">${message.status === 'new' ? 'Mark read' : 'Read'}</button>
          <button class="secondary-btn small" data-action="delete-message" data-id="${message.id}">Delete</button>
        </div>
      </article>
    `).join('') : '<article class="content-card"><p>No messages yet.</p></article>';
  } catch (error) {
    app.messageList.innerHTML = `<article class="content-card"><p>${error.message}</p></article>`;
  }
}

async function loadAnalytics() {
  try {
    const payload = await apiRequest('/api/admin/analytics');
    const byType = payload.data.byType || [];
    const byDay = payload.data.byDay || [];

    app.analyticsPanels.innerHTML = `
      <article class="analytics-card">
        <h3>By event type</h3>
        <ul>${byType.map((row) => `<li>${row.event_type}: ${row.count}</li>`).join('') || '<li>No data yet.</li>'}</ul>
      </article>
      <article class="analytics-card">
        <h3>By day</h3>
        <ul>${byDay.map((row) => `<li>${new Date(row.day).toLocaleDateString()}: ${row.count}</li>`).join('') || '<li>No data yet.</li>'}</ul>
      </article>
    `;
  } catch (error) {
    app.analyticsPanels.innerHTML = `<article class="analytics-card"><h3>Error</h3><p>${error.message}</p></article>`;
  }
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const id = document.getElementById('project-id').value;
  const payload = {
    title: document.getElementById('project-title').value,
    slug: document.getElementById('project-slug').value,
    category: document.getElementById('project-category').value,
    shortDescription: document.getElementById('project-short').value,
    description: document.getElementById('project-description').value,
    imageUrl: document.getElementById('project-image').value,
    liveUrl: document.getElementById('project-live').value,
    repoUrl: document.getElementById('project-repo').value,
    technologies: document.getElementById('project-technologies').value,
    featured: document.getElementById('project-featured').value === 'true',
    published: document.getElementById('project-published').value === 'true',
  };

  try {
    const file = document.getElementById('project-image-file').files[0];
    let uploadedUrl = payload.imageUrl || '';

    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      const uploadResult = await apiRequest('/api/admin/uploads', {
        method: 'POST',
        body: formData,
      });
      uploadedUrl = uploadResult.data.url;
      payload.imageUrl = uploadedUrl;
    }

    if (id) {
      await apiRequest(`/api/admin/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatus('project-status', 'Project updated successfully.', 'success');
    } else {
      await apiRequest('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setStatus('project-status', 'Project created successfully.', 'success');
    }

    form.reset();
    document.getElementById('project-form').classList.add('hidden');
    loadProjects();
  } catch (error) {
    setStatus('project-status', error.message, 'error');
  }
}

async function handleMessageAction(action, id) {
  if (action === 'toggle-read') {
    await apiRequest(`/api/admin/messages/${id}/read`, { method: 'PATCH' });
    loadMessages();
    return;
  }

  if (action === 'delete-message') {
    await apiRequest(`/api/admin/messages/${id}`, { method: 'DELETE' });
    loadMessages();
  }
}

async function handleProjectAction(action, id) {
  if (action === 'delete-project') {
    await apiRequest(`/api/admin/projects/${id}`, { method: 'DELETE' });
    loadProjects();
    return;
  }

  if (action === 'edit-project') {
    const project = state.projects.find((item) => item.id === Number(id));
    if (!project) return;

    document.getElementById('project-id').value = project.id;
    document.getElementById('project-title').value = project.title;
    document.getElementById('project-slug').value = project.slug;
    document.getElementById('project-category').value = project.category_name || 'General';
    document.getElementById('project-short').value = project.short_description;
    document.getElementById('project-description').value = project.description;
    document.getElementById('project-image').value = project.image_url || '';
    document.getElementById('project-live').value = project.live_url || '';
    document.getElementById('project-repo').value = project.repo_url || '';
    document.getElementById('project-technologies').value = (project.technologies || []).join(', ');
    document.getElementById('project-featured').value = project.featured ? 'true' : 'false';
    document.getElementById('project-published').value = project.published ? 'true' : 'false';
    document.getElementById('project-form').classList.remove('hidden');
  }
}

document.getElementById('login-form').addEventListener('submit', login);
document.getElementById('logout-btn').addEventListener('click', logout);
document.querySelectorAll('.nav-link').forEach((button) => {
  button.addEventListener('click', () => {
    if (!state.user) return;
    setScreen(button.dataset.view);
  });
});
document.getElementById('new-project-btn').addEventListener('click', () => {
  document.getElementById('project-form').classList.remove('hidden');
  document.getElementById('project-form').reset();
  document.getElementById('project-id').value = '';
  setStatus('project-status', '', '');
});
document.getElementById('cancel-project-btn').addEventListener('click', () => {
  document.getElementById('project-form').classList.add('hidden');
  document.getElementById('project-form').reset();
  document.getElementById('project-id').value = '';
});
document.getElementById('project-form').addEventListener('submit', handleProjectSubmit);

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action && id) {
    if (action.startsWith('delete') || action.startsWith('toggle')) {
      const mappedAction = action === 'toggle-read' ? 'toggle-read' : action;
      const messageOrProject = action.includes('message') ? 'message' : 'project';
      if (messageOrProject === 'message') {
        await handleMessageAction(mappedAction, id);
      } else {
        await handleProjectAction(mappedAction, id);
      }
    }

    if (button.dataset.action === 'edit-project') {
      handleProjectAction('edit-project', id);
    }
  }
});

setScreen('overview');
