function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadProfile() {
    const statusResp = await fetch('/api/auth/status', { credentials: 'include' });
    if (!statusResp.ok) { window.location.href = '/user/login.html'; return; }
    const status = await statusResp.json();
    if (!status.loggedIn) { window.location.href = '/user/login.html'; return; }

    const user = status.user;
    document.getElementById('displayUsername').textContent = user.username;
    document.getElementById('editBtn').style.display = 'inline-block';

    const postsResp = await fetch('/api/posts', { credentials: 'include' });
    const postsContainer = document.getElementById('posts');

    if (!postsResp.ok) { postsContainer.innerHTML = '<div>Lỗi tải dữ liệu.</div>'; return; }

    const allPosts = await postsResp.json();
    const myPosts = allPosts.filter(p => String(p.user_id) === String(user.id));

    document.getElementById('postCount').innerHTML = `<strong>${myPosts.length}</strong> bài viết`;

    if (myPosts.length === 0) {
        postsContainer.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding: 50px;">Chưa có bài viết nào.</div>';
        return;
    }

    postsContainer.innerHTML = myPosts.map(p => {
        const imgSrc = p.image_url ? escapeHtml(p.image_url) : 'https://via.placeholder.com/500?text=No+Image';
        return `
            <div class="post-item">
                <img src="${imgSrc}" alt="${escapeHtml(p.caption || '')}" title="${escapeHtml(p.caption || '')}" />
            </div>
        `;
    }).join('');
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        window.location.href = '/user/login.html';
    } catch (err) {
        console.error('Lỗi khi đăng xuất:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProfile();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            handleLogout();
        });
    }
});
