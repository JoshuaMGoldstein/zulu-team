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

    // Role-related elements
    const editRolesButton = document.getElementById('edit-roles-button');
    const roleListModalElement = document.getElementById('role-list-modal');
    const roleListModal = new bootstrap.Modal(roleListModalElement);
    const roleEditorModalElement = document.getElementById('role-editor-modal');
    const roleEditorModal = new bootstrap.Modal(roleEditorModalElement);
    const roleForm = document.getElementById('role-form');
    const roleList = document.getElementById('role-list');
    const addNewRoleButton = document.getElementById('add-new-role-button');
    const roleEditorModalLabel = document.getElementById('roleEditorModalLabel');
    const roleIdInput = document.getElementById('role-id');

    // Settings-related elements
    const editSettingsButton = document.getElementById('edit-settings-button');
    const settingsEditorModalElement = document.getElementById('settings-editor-modal');
    const settingsEditorModal = new bootstrap.Modal(settingsEditorModalElement);
    const settingsForm = document.getElementById('settings-form');

    // Template-related elements
    const templateEditorModalElement = document.getElementById('template-editor-modal');
    const templateEditorModal = new bootstrap.Modal(templateEditorModalElement);
    const templateForm = document.getElementById('template-form');
    const templateContentInput = document.getElementById('template-content');
    const templateRoleIdInput = document.getElementById('template-role-id');

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
        description: document.getElementById('project-description'),
        repositoryUrl: document.getElementById('project-repositoryUrl'),
        discordChannelIds: document.getElementById('project-discordChannelIds'),
    });

    const getRoleFormElements = () => ({
        id: document.getElementById('role-id'),
        name: document.getElementById('role-name'),
        description: document.getElementById('role-description'),
        dmVerbosity: document.getElementById('role-dmVerbosity'),
        channelVerbosity: document.getElementById('role-channelVerbosity'),
        delegatedVerbosity: document.getElementById('role-delegatedVerbosity'),
        mountBotInstances: document.getElementById('role-mountBotInstances'),
        allowDelegation: document.getElementById('role-allowDelegation'),
    });

    const getSettingsFormElements = () => ({
        dmVerbosity: document.getElementById('dmVerbosity'),
        channelVerbosity: document.getElementById('channelVerbosity'),
        delegatedVerbosity: document.getElementById('delegatedVerbosity'),
    });

    const verbosityOptions = [
        { value: -1, text: 'Inherit' },
        { value: 0, text: 'None' },
        { value: 1, text: 'Output Only' },
        { value: 3, text: 'Output & Tool Use' },
    ];

    const populateVerbosityDropdown = (selectElement, selectedValue, includeInherit = true) => {
        selectElement.innerHTML = '';
        const options = includeInherit ? verbosityOptions : verbosityOptions.filter(opt => opt.value !== -1);
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            if (parseInt(selectedValue) === opt.value) {
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
    };

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
                <span>${bot.name} <small class="text-muted">(${bot.id})</small> - <strong>${bot.role}</strong></span>
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
                    <p>${project.description}</p>
                    <p><a href="${project.repositoryUrl}" target="_blank">${project.repositoryUrl}</a></p>
                </div>
                <button class="btn btn-sm btn-outline-secondary edit-project" data-id="${project.id}">Edit</button>
            `;
            projectList.appendChild(projectElement);
        });
    };

    const fetchRoles = async () => {
        const response = await fetch('/api/roles');
        const roles = await response.json();
        roleList.innerHTML = '';
        for (const id in roles) {
            const role = roles[id];
            const roleElement = document.createElement('div');
            roleElement.className = 'list-group-item d-flex justify-content-between align-items-center';
            roleElement.innerHTML = `
                <div>
                    <h5>${role.name} <small class="text-muted">(${id})</small></h5>
                    <p>${role.description}</p>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-info edit-template" data-id="${id}">Edit Template</button>
                    <button class="btn btn-sm btn-outline-secondary edit-role" data-id="${id}">Edit</button>
                </div>
            `;
            roleList.appendChild(roleElement);
        }
    };

    const fetchSettings = async () => {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        const elements = getSettingsFormElements();
        populateVerbosityDropdown(elements.dmVerbosity, settings.dmVerbosity, false);
        populateVerbosityDropdown(elements.channelVerbosity, settings.channelVerbosity, false);
        populateVerbosityDropdown(elements.delegatedVerbosity, settings.delegatedVerbosity, false);
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
                        if ((key === 'managedProjects' || key === 'discordChannelId') && Array.isArray(value)) {
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
                elements.description.value = project.description;
                elements.repositoryUrl.value = project.repositoryUrl;
                elements.discordChannelIds.value = project.discordChannelIds.join(', ');
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
            description: elements.description.value,
            repositoryUrl: elements.repositoryUrl.value,
            discordChannelIds: elements.discordChannelIds.value.split(',').map(s => s.trim()).filter(s => s),
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

    // Role event listeners
    editRolesButton.addEventListener('click', () => {
        fetchRoles();
        roleListModal.show();
    });

    addNewRoleButton.addEventListener('click', () => {
        roleEditorModalLabel.textContent = 'Add New Role';
        roleForm.reset();
        const elements = getRoleFormElements();
        populateVerbosityDropdown(elements.dmVerbosity, -1);
        populateVerbosityDropdown(elements.channelVerbosity, -1);
        populateVerbosityDropdown(elements.delegatedVerbosity, -1);
        roleIdInput.disabled = false;
        roleEditorModal.show();
    });

    roleList.addEventListener('click', async (event) => {
        if (event.target.classList.contains('edit-role')) {
            const roleId = event.target.dataset.id;
            const response = await fetch('/api/roles');
            const roles = await response.json();
            const role = roles[roleId];

            if (role) {
                roleEditorModalLabel.textContent = `Edit Role: ${role.name}`;
                const elements = getRoleFormElements();
                elements.id.value = roleId;
                elements.name.value = role.name;
                elements.description.value = role.description;
                populateVerbosityDropdown(elements.dmVerbosity, role.dmVerbosity);
                populateVerbosityDropdown(elements.channelVerbosity, role.channelVerbosity);
                populateVerbosityDropdown(elements.delegatedVerbosity, role.delegatedVerbosity);
                elements.mountBotInstances.checked = role.mountBotInstances;
                elements.allowDelegation.checked = role.allowDelegation;
                roleIdInput.disabled = true;
                roleEditorModal.show();
            }
        }
    });

    roleForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const elements = getRoleFormElements();
        const id = elements.id.value;
        const isNewRole = !roleIdInput.disabled;

        const roleData = {
            id: id,
            name: elements.name.value,
            description: elements.description.value,
            dmVerbosity: parseInt(elements.dmVerbosity.value),
            channelVerbosity: parseInt(elements.channelVerbosity.value),
            delegatedVerbosity: parseInt(elements.delegatedVerbosity.value),
            mountBotInstances: elements.mountBotInstances.checked,
            allowDelegation: elements.allowDelegation.checked,
        };

        const url = isNewRole ? '/api/roles' : `/api/roles/${id}`;
        const method = isNewRole ? 'POST' : 'PUT';

        await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(roleData),
        });

        roleEditorModal.hide();
        fetchRoles();
    });

    // Settings event listeners
    editSettingsButton.addEventListener('click', () => {
        fetchSettings();
        settingsEditorModal.show();
    });

    settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const elements = getSettingsFormElements();
        const settingsData = {
            dmVerbosity: parseInt(elements.dmVerbosity.value),
            channelVerbosity: parseInt(elements.channelVerbosity.value),
            delegatedVerbosity: parseInt(elements.delegatedVerbosity.value),
        };

        await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsData),
        });

        settingsEditorModal.hide();
    });

    // Template event listeners
    roleList.addEventListener('click', async (event) => {
        if (event.target.classList.contains('edit-template')) {
            const roleId = event.target.dataset.id;
            const response = await fetch(`/api/templates/${roleId}`);
            const template = await response.text();
            templateRoleIdInput.value = roleId;
            templateContentInput.value = template;
            templateEditorModal.show();
        }
    });

    templateForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const roleId = templateRoleIdInput.value;
        const content = templateContentInput.value;

        await fetch(`/api/templates/${roleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain' },
            body: content,
        });

        templateEditorModal.hide();
    });

    // Initial fetch
    fetchBots();
});