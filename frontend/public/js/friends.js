(async () => {
    const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;
    const usersList = document.getElementById('usersList');

    async function ensureAuth() {
        const r = await fetch(`${baseUrl}/api/auth/status`, { credentials: 'include' });
        const d = await r.json();
        if (!d.loggedIn) location.href = `${baseUrl}/user/login.html`;
        return d.user;
    }

    async function loadUsers() {
        usersList.textContent = 'Đang tải...';
        const r = await fetch(`${baseUrl}/api/users`, { credentials: 'include' });
        const users = await r.json();
        render(users);
    }

    function render(users) {
        usersList.innerHTML = '';
        users.forEach(u => {
            const el = document.createElement('div'); el.className = 'user';
            el.innerHTML = `<div class="avatar">${(u.username || 'U').charAt(0).toUpperCase()}</div><div><div style="font-weight:600">${u.username}</div><div class="small">ID: ${u.id}</div></div>`;
            const actions = document.createElement('div'); actions.className = 'actions';
            const followBtn = document.createElement('button'); followBtn.className = 'btn';
            followBtn.innerHTML = u.is_following ? '<i class="fa-solid fa-user-check"></i> Đang theo dõi' : '<i class="fa-solid fa-user-plus"></i> Follow';
            followBtn.addEventListener('click', async () => {
                followBtn.disabled = true;
                if (u.is_following) {
                    await fetch(`${baseUrl}/api/unfollow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ userId: u.id }) });
                    u.is_following = 0; followBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Follow';
                } else {
                    await fetch(`${baseUrl}/api/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ userId: u.id }) });
                    u.is_following = 1; followBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Đang theo dõi';
                }
                followBtn.disabled = false;
            });
            const chatBtn = document.createElement('button'); chatBtn.className = 'btn ghost'; chatBtn.innerHTML = '<i class="fa-solid fa-comment"></i> Chat';
            // ensure button is enabled (handles back-navigation cached state)
            chatBtn.disabled = false;
            chatBtn.addEventListener('click', async () => {
                chatBtn.disabled = true;
                try {
                    // create conversation with this user (server will return existing convo if any)
                    const r = await fetch(`${baseUrl}/api/conversations`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantIds: [u.id], title: u.username }) });
                    const data = await r.json();
                    if (data && data.id) {
                        location.href = `${baseUrl}/chat.html?conv=${data.id}`;
                        return;
                    } else {
                        alert('Không tạo được cuộc trò chuyện');
                    }
                } catch (err) {
                    console.error('Error creating conversation', err);
                    alert('Lỗi khi tạo cuộc trò chuyện');
                } finally {
                    // if navigation didn't happen, re-enable the button
                    chatBtn.disabled = false;
                }
            });
            actions.appendChild(followBtn); actions.appendChild(chatBtn);
            el.appendChild(actions);
            usersList.appendChild(el);
        });
    }

    // Handle bfcache / back navigation: if page was restored from cache, reload user list
    window.addEventListener('pageshow', (ev) => {
        if (ev.persisted) {
            loadUsers();
        } else {
            // also ensure buttons are enabled if coming back without full reload
            Array.from(document.querySelectorAll('.btn')).forEach(b => b.disabled = false);
        }
    });

    await ensureAuth();
    await loadUsers();
})();
