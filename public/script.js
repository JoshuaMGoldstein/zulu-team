document.addEventListener('DOMContentLoaded', async () => {
    // Common elements
    const botList = document.getElementById('bot-list');

    // Bot-related elements
    const addBotButton = document.getElementById('add-bot');
    const botModalElement = document.getElementById('bot-modal');
    const botModal = new bootstrap.Modal(botModalElement);
    const botForm = document.getElementById('bot-form');
    const botIdInput = document.getElementById('bot-id');
    const botModalLabel = document.getElementById('botModalLabel');
    const botCliSelect = document.getElementById('bot-cli');
    const botModelSelect = document.getElementById('bot-model');

    // Project-related elements
    const openProjectsButton = document.getElementById('open-projects-button');
    const projectListModalElement = document.getElementById('project-list-modal');
    const projectListModal = new bootstrap.Modal(projectListModalElement);
    const projectEditorModalElement = document.getElementById('project-editor-modal');
    const projectEditorModal = new bootstrap.Modal(projectEditorModalElement);
    const projectForm = document.getElementById('project-form');
    const projectList = document.getElementById('project-list');
    const addNewProjectButton = document.getElementById('add-new-project-button');
    const projectEditorModalLabel = document.getElementById('projectEditorModalLabel');
    const projectIdInput = document.getElementById('project-id');

    // Fetch models
    const response = await fetch('/api/models');
    const models = await response.json();

    const getBotFormElements = () => ({
        id: document.getElementById('bot-id'),
        name: document.getElementById('bot-name'),
        role: document.getElementById('bot-role'),
        cli: document.getElementById('bot-cli'),
        enabled: document.getElementById('bot-enabled'),
        model: document.getElementById('bot-model'),
        discordBotToken: document.getElementById('bot-discordBotToken'),
        discordChannelId: document.getElementById('bot-discordChannelId'),
        status: document.getElementById('bot-status'),
        lastActivity: document.getElementById('bot-lastActivity'),
        managedProjects: document.getElementById('bot-managedProjects'),
    });

    const getProjectFormElements = () => ({
        id: document.getElementById('project-id'),
        name: document.getElementById('project-name'),
        repositoryUrl: document.getElementById('project-repositoryUrl'),
    });

    const populateModelDropdown = (cli, selectedModel) => {
        const modelList = models[cli];
        botModelSelect.innerHTML = '';
        modelList.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            if (model === selectedModel) {
                option.selected = true;
            }
            botModelSelect.appendChild(option);
        });
    };

    const fetchBots = async () => {
        const response = await fetch('/api/bots');
        const bots = await response.json();
        botList.innerHTML = '';
        bots.forEach(bot => {
            const botElement = document.createElement('a');
            botElement.href = '#';
            botElement.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            botElement.innerHTML = `
                <span>${bot.name} <small class="text-muted">(${bot.id})</small></span>
                <button class="btn btn-sm btn-outline-secondary edit-bot" data-id="${bot.id}">Edit</button>
            `;
            botList.appendChild(botElement);
        });
    };

    const fetchProjects = async () => {
        const response = await fetch('/api/projects');
        const projects = await response.json();
        projectList.innerHTML = '';
        projects.forEach(project => {
            const projectElement = document.createElement('div');
            projectElement.className = 'list-group-item d-flex justify-content-between align-items-center';
            projectElement.innerHTML = `
                <div>
                    <h5>${project.name} <small class="text-muted">(${project.id})</small></h5>
                    <p>${project.repositoryUrl}</p>
                </div>
                <button class="btn btn-sm btn-outline-secondary edit-project" data-id="${project.id}">Edit</button>
            `;
            projectList.appendChild(projectElement);
        });
    };

    // Bot event listeners
    addBotButton.addEventListener('click', () => {
        botModalLabel.textContent = 'Add New Bot';
        botForm.reset();
        const elements = getBotFormElements();
        elements.status.textContent = 'idle';
        elements.lastActivity.textContent = new Date().toISOString();
        botIdInput.disabled = false;
        populateModelDropdown('gemini');
        botModal.show();
    });

    botCliSelect.addEventListener('change', () => {
        const selectedCli = botCliSelect.value;
        populateModelDropdown(selectedCli);
        if (selectedCli === 'gemini') {
            botModelSelect.value = models.gemini.find(m => m.includes('pro'));
        }
    });

    botList.addEventListener('click', async (event) => {
        if (event.target.classList.contains('edit-bot')) {
            const botId = event.target.dataset.id;
            const response = await fetch('/api/bots');
            const bots = await response.json();
            const bot = bots.find(b => b.id === botId);

            if (bot) {
                botModalLabel.textContent = `Edit Bot: ${bot.name}`;
                const elements = getBotFormElements();
                for (const key in elements) {
                    const element = elements[key];
                    const value = bot[key];
                    if (element.type === 'checkbox') {
                        element.checked = value;
                    } else if (element.tagName === 'INPUT' || element.tagName === 'SELECT') {
                        if (key === 'managedProjects' && Array.isArray(value)) {
                            element.value = value.join(', ');
                        } else {
                            element.value = value || '';
                        }
                    } else {
                        element.textContent = value || 'N/A';
                    }
                }
                populateModelDropdown(bot.cli, bot.model);
                botIdInput.disabled = true;
                botModal.show();
            }
        }
    });

    botForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const elements = getBotFormElements();
        const id = elements.id.value;
        const isNewBot = !botIdInput.disabled;

        const botData = {};
        for (const key in elements) {
            const element = elements[key];
            if (element.type === 'checkbox') {
                botData[key] = element.checked;
            } else if ((element.tagName === 'INPUT' || element.tagName === 'SELECT') && element.value) {
                if (key === 'managedProjects' || key === 'discordChannelId') {
                    botData[key] = element.value.split(',').map(s => s.trim()).filter(s => s);
                } else {
                    botData[key] = element.value;
                }
            }
        }

        const url = isNewBot ? '/api/bots' : `/api/bots/${id}`;
        const method = isNewBot ? 'POST' : 'PUT';

        await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botData),
        });

        botModal.hide();
        fetchBots();
    });

    // Project event listeners
    openProjectsButton.addEventListener('click', () => {
        fetchProjects();
        projectListModal.show();
    });

    addNewProjectButton.addEventListener('click', () => {
        projectEditorModalLabel.textContent = 'Add New Project';
        projectForm.reset();
        projectIdInput.disabled = false;
        projectEditorModal.show();
    });

    projectList.addEventListener('click', async (event) => {
        if (event.target.classList.contains('edit-project')) {
            const projectId = event.target.dataset.id;
            const response = await fetch('/api/projects');
            const projects = await response.json();
            const project = projects.find(p => p.id === projectId);

            if (project) {
                projectEditorModalLabel.textContent = `Edit Project: ${project.name}`;
                const elements = getProjectFormElements();
                elements.id.value = project.id;
                elements.name.value = project.name;
                elements.repositoryUrl.value = project.repositoryUrl;
                projectIdInput.disabled = true;
                projectEditorModal.show();
            }
        }
    });

    projectForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const elements = getProjectFormElements();
        const id = elements.id.value;
        const isNewProject = !projectIdInput.disabled;

        const projectData = {
            id: id,
            name: elements.name.value,
            repositoryUrl: elements.repositoryUrl.value,
        };

        const url = isNewProject ? '/api/projects' : `/api/projects/${id}`;
        const method = isNewProject ? 'POST' : 'PUT';

        await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(projectData),
        });

        projectEditorModal.hide();
        fetchProjects();
    });

    // Initial fetch
    fetchBots();
});
