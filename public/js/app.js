let currentToken = '';
let currentGuild = '';
let currentChannel = '';
let ws = null;
let guildRoles = new Map();
let guildMembers = new Map();

async function makeDiscordRequest(endpoint, options = {}) {
    try {
        const defaultOptions = {
            headers: {
                'Authorization': `Bot ${currentToken}`,
                'Content-Type': 'application/json'
            }
        };

        const response = await fetch(`http://localhost:3000/discord${endpoint}`, {
            ...defaultOptions,
            ...options
        });

        if (!response.ok) {
            throw new Error(`Discord API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

function showUserProfile(userId, guildId) {
    const modal = document.getElementById('userProfileModal');
    const overlay = document.getElementById('modalOverlay');
    const roles = guildRoles.get(guildId);
    const members = guildMembers.get(guildId);
    
    if (!roles || !members) {
        console.error('No roles or members found for guild:', guildId);
        return;
    }

    const member = members.find(m => m.user.id === userId);
    if (!member) {
        console.error('Member not found:', userId);
        return;
    }

    const memberRoles = member.roles
        .map(roleId => roles.find(r => r.id === roleId))
        .filter(role => role && role.name !== '@everyone')
        .sort((a, b) => b.position - a.position);

    const highestRole = memberRoles[0];
    const roleColor = highestRole ? `#${highestRole.color.toString(16).padStart(6, '0')}` : '#ffffff';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="user-profile-header">
                <img src="${member.user.avatar 
                    ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`
                    : 'default-avatar.png'}" 
                    alt="${member.user.username}" 
                    class="profile-avatar">
                <div class="user-info">
                    <div class="username-container">
                        <h2 style="color: ${roleColor}">${member.user.username}</h2>
                        <span class="discriminator">#${member.user.discriminator || '0000'}</span>
                        ${member.user.bot ? '<span class="badge app">APP</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="profile-divider"></div>
            <div class="profile-section roles-section">
                <h3>ROLES - ${memberRoles.length}</h3>
                <div class="roles-list">
                    ${memberRoles.map(role => `
                        <div class="role-tag" style="background-color: rgba(${hexToRgb(role.color.toString(16).padStart(6, '0'))}, 0.1); color: #${role.color.toString(16).padStart(6, '0')}">
                            <div class="role-dot" style="background-color: #${role.color.toString(16).padStart(6, '0')}"></div>
                            ${role.name}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="profile-section member-since">
                <h3>MEMBER SINCE</h3>
                <div class="timestamp">
                    ${new Date(member.joined_at || Date.now()).toLocaleDateString()}
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'block';
    overlay.style.display = 'block';
}

function hexToRgb(hex) {
    hex = hex.padStart(6, '0');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}

async function login() {
    try {
        const token = document.getElementById('tokenInput').value.trim();
        if (!token) {
            alert('Please enter a bot token');
            return;
        }

        const response = await fetch('http://localhost:3000/discord/users/@me', {
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.status === 401 || data.code === 0) {
            alert('Bot token is invalid!');
            currentToken = '';
            return;
        }

        currentToken = token;
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('discordApp').classList.remove('hidden');

        document.getElementById('botName').textContent = data.username;
        if (data.avatar) {
            document.getElementById('botAvatar').src = 
                `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=32`;
        }

        await loadServers();
        setupWebSocket();
        setupModalListeners();

    } catch (error) {
        alert('Bot token is invalid!');
        currentToken = '';
    }
}

function setupModalListeners() {
    const modal = document.getElementById('userProfileModal');
    const overlay = document.getElementById('modalOverlay');

    overlay.addEventListener('click', () => {
        modal.style.display = 'none';
        overlay.style.display = 'none';
    });
}

async function loadServers() {
    try {
        const guilds = await makeDiscordRequest('/users/@me/guilds');
        const serversList = document.getElementById('serversList');
        
        // Add CSS for server icons
        const style = document.createElement('style');
        style.textContent = `
            .server-icon {
                width: 48px;
                height: 48px;
                margin: 8px;
                border-radius: 50%;
                position: relative;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #36393f;
            }

            .server-icon img {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
            }

            .server-icon:hover {
                border-radius: 35%;
            }

            .server-icon.active {
                border-radius: 35%;
            }

            .server-icon.active::before {
                content: '';
                position: absolute;
                left: -15px;
                width: 8px;
                height: 40px;
                border-radius: 0 4px 4px 0;
                background-color: white;
            }

            .server-acronym {
                color: white;
                font-size: 18px;
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);
        
        serversList.innerHTML = guilds.map(guild => `
            <div class="server-icon" onclick="selectServer('${guild.id}')" title="${guild.name}">
                ${guild.icon 
                    ? `<img src="https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=48" alt="${guild.name}">`
                    : `<div class="server-acronym">${guild.name.charAt(0)}</div>`
                }
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading servers:', error);
    }
}

async function selectServer(guildId) {
    try {
        currentGuild = guildId;
        
        // Remove active class from all server icons
        document.querySelectorAll('.server-icon').forEach(icon => {
            icon.classList.remove('active');
        });
        
        // Add active class to selected server
        const selectedServer = document.querySelector(`.server-icon[onclick*="${guildId}"]`);
        if (selectedServer) {
            selectedServer.classList.add('active');
        }

        const [guild, channels, roles, members] = await Promise.all([
            makeDiscordRequest(`/guilds/${guildId}`),
            makeDiscordRequest(`/guilds/${guildId}/channels`),
            makeDiscordRequest(`/guilds/${guildId}/roles`),
            makeDiscordRequest(`/guilds/${guildId}/members?limit=1000`)
        ]);

        guildRoles.set(guildId, roles);
        guildMembers.set(guildId, members);

        document.getElementById('serverHeader').textContent = guild.name;

        const categories = new Map();
        const uncategorizedChannels = [];

        channels.forEach(channel => {
            if (channel.type === 4) {
                categories.set(channel.id, {
                    ...channel,
                    channels: []
                });
            }
        });

        channels.forEach(channel => {
            if (channel.type !== 4) {
                const isHidden = channel.permission_overwrites?.some(
                    perm => (perm.deny & 0x400) === 0x400
                );
                
                const channelHTML = `
                    <div class="channel-item ${isHidden ? 'hidden-channel' : ''}" 
                         onclick="${isHidden ? 'alert(\'You cannot access this channel\')' : `selectChannel('${channel.id}')`}" 
                         data-channel-id="${channel.id}">
                        ${channel.type === 2 ? '🔊' : '#'} ${channel.name}
                    </div>
                `;

                if (channel.parent_id && categories.has(channel.parent_id)) {
                    categories.get(channel.parent_id).channels.push(channelHTML);
                } else {
                    uncategorizedChannels.push(channelHTML);
                }
            }
        });

        const channelsList = document.getElementById('channelsList');
        let channelsHTML = '';

        categories.forEach(category => {
            channelsHTML += `
                <div class="category">
                    <div class="category-header">
                        <span class="category-arrow">▼</span>
                        ${category.name}
                    </div>
                    <div class="category-channels">
                        ${category.channels.join('')}
                    </div>
                </div>
            `;
        });

        if (uncategorizedChannels.length > 0) {
            channelsHTML += uncategorizedChannels.join('');
        }

        channelsList.innerHTML = channelsHTML;

        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', () => {
                const category = header.parentElement;
                const channels = category.querySelector('.category-channels');
                const arrow = header.querySelector('.category-arrow');
                
                if (channels.style.display === 'none') {
                    channels.style.display = 'block';
                    arrow.textContent = '▼';
                } else {
                    channels.style.display = 'none';
                    arrow.textContent = '▶';
                }
            });
        });

        await loadMembers(guildId);
    } catch (error) {
        console.error('Error selecting server:', error);
    }
}

async function selectChannel(channelId) {
    try {
        currentChannel = channelId;
        const channel = await makeDiscordRequest(`/channels/${channelId}`);
        
        document.getElementById('channelHeader').textContent = `# ${channel.name}`;
        document.getElementById('messageInput').placeholder = `Message #${channel.name}`;
        
        await loadMessages(channelId);

        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-channel-id="${channelId}"]`).classList.add('active');
    } catch (error) {
        console.error('Error selecting channel:', error);
    }
}

async function loadMessages(channelId) {
    try {
        const messages = await makeDiscordRequest(`/channels/${channelId}/messages?limit=50`);
        const messagesContainer = document.getElementById('messagesContainer');
        const roles = guildRoles.get(currentGuild);
        const members = guildMembers.get(currentGuild);
        
        if (!roles || !members) {
            console.error('No roles or members found for guild:', currentGuild);
            return;
        }

        messagesContainer.innerHTML = messages.reverse().map(message => {
            const member = members.find(m => m.user.id === message.author.id);
            const memberRoles = (member?.roles || [])
                .map(roleId => roles.find(r => r.id === roleId))
                .filter(role => role)
                .sort((a, b) => b.position - a.position);
            
            const highestRole = memberRoles[0];
            const roleColor = highestRole ? `#${highestRole.color.toString(16).padStart(6, '0')}` : '#ffffff';
            const timestamp = new Date(message.timestamp).toLocaleString();
            
            return `
                <div class="message">
                    <img src="${message.author.avatar 
                        ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png?size=32`
                        : 'default-avatar.png'}" 
                        alt="${message.author.username}" 
                        class="message-avatar">
                    <div class="message-content">
                        <div class="message-header">
                            <span class="message-author" 
                                  onclick="showUserProfile('${message.author.id}', '${currentGuild}')"
                                  style="color: ${roleColor}; cursor: pointer;">
                                ${message.author.username}
                            </span>
                            ${message.author.bot ? 
                                (message.author.verified ? 
                                    '<span class="badge verified-app">Verified APP</span>' : 
                                    '<span class="badge app">APP</span>')
                                : ''
                            }
                            <span class="message-timestamp">${timestamp}</span>
                        </div>
                        <div class="message-text">${message.content}</div>
                    </div>
                </div>
            `;
        }).join('');

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

async function loadMembers(guildId) {
    try {
        const [members, roles] = await Promise.all([
            makeDiscordRequest(`/guilds/${guildId}/members?limit=1000`),
            makeDiscordRequest(`/guilds/${guildId}/roles`)
        ]);

        guildMembers.set(guildId, members);
        guildRoles.set(guildId, roles);

        const membersList = document.getElementById('membersList');
        
        const roleGroups = new Map();
        roles.forEach(role => {
            if (role.name !== '@everyone') {
                roleGroups.set(role.id, {
                    role: role,
                    members: []
                });
            }
        });

        const othersGroup = [];

        members.forEach(member => {
            const memberRoles = member.roles
                .map(roleId => roles.find(r => r.id === roleId))
                .filter(r => r)
                .sort((a, b) => b.position - a.position);

            const highestRole = memberRoles[0];
            const roleColor = highestRole ? `#${highestRole.color.toString(16).padStart(6, '0')}` : '#ffffff';

            const memberHTML = `
                <div class="member" onclick="showUserProfile('${member.user.id}', '${guildId}')" style="cursor: pointer;">
                    <img src="${member.user.avatar 
                        ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=32`
                        : 'default-avatar.png'}" 
                        alt="${member.user.username}" 
                        class="member-avatar">
                    <div class="member-info">
                        <span class="member-name" style="color: ${roleColor}">
                            ${member.user.username}
                        </span>
                    </div>
                </div>
            `;

            if (highestRole && roleGroups.has(highestRole.id)) {
                roleGroups.get(highestRole.id).members.push(memberHTML);
            } else {
                othersGroup.push(memberHTML);
            }
        });

        let membersHTML = '';

        Array.from(roleGroups.values())
            .sort((a, b) => b.role.position - a.role.position)
            .forEach(group => {
                if (group.members.length > 0) {
                    membersHTML += `
                        <div class="role-group">
                            <div class="role-separator">
                                <span class="role-name" style="color: #${group.role.color.toString(16).padStart(6, '0')}">
                                    ${group.role.name.toUpperCase()} — ${group.members.length}
                                </span>
                            </div>
                            ${group.members.join('')}
                        </div>
                    `;
                }
            });

        if (othersGroup.length > 0) {
            membersHTML += `
                <div class="role-group">
                    <div class="role-separator">
                        <span class="role-name">MEMBERS — ${othersGroup.length}</span>
                    </div>
                    ${othersGroup.join('')}
                </div>
            `;
        }

        membersList.innerHTML = membersHTML;
    } catch (error) {
        console.error('Error loading members:', error);
    }
}

async function sendMessage() {
    if (!currentChannel) return;

    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content) return;

    try {
        await makeDiscordRequest(`/channels/${currentChannel}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        
        input.value = '';
        await loadMessages(currentChannel);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

function setupWebSocket() {
    if (ws) {
        ws.close();
    }

    ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            op: 2,
            d: {
                token: currentToken,
                intents: 513,
                properties: {
                    os: 'linux',
                    browser: 'chrome',
                    device: 'chrome'
                }
            }
        }));
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        if (data.t === 'MESSAGE_CREATE' && data.d.channel_id === currentChannel) {
            await loadMessages(currentChannel);
        }
        
        if (data.op === 10) {
            setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ op: 1, d: null }));
                }
            }, data.d.heartbeat_interval);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };

    ws.onclose = () => {
        setTimeout(setupWebSocket, 5000);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});
