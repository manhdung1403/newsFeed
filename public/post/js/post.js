let isLoggedIn = false;
let currentUser = null;

// Lấy base URL
const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:'
    ? 'http://localhost:3000'
    : window.location.origin;

// Kiểm tra trạng thái đăng nhập
async function checkAuthStatus() {
    try {
        const response = await fetch(`${baseUrl}/api/auth/status`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (data.loggedIn) {
            isLoggedIn = true;
            currentUser = data.user;
            updateUIForLoggedIn();
            fetchPosts();
        } else {
            isLoggedIn = false;
            updateUIForLoggedOut();
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra đăng nhập:", error);
        updateUIForLoggedOut();
    }
}

// Cập nhật UI khi đã đăng nhập
function updateUIForLoggedIn() {
    const authButtons = document.getElementById('authButtons');
    const userInfo = document.getElementById('userInfo');
    const usernameDisplay = document.getElementById('usernameDisplay');
    const profileLink = document.getElementById('profileLink');
    const addPostLink = document.getElementById('addPostLink');

    authButtons.style.display = 'none';
    userInfo.style.display = 'flex';
    usernameDisplay.textContent = currentUser.username;
    profileLink.href = `${baseUrl}/user/profile.html`;
    profileLink.style.display = 'inline-block';
    addPostLink.href = `${baseUrl}/post/addpost.html`;
    addPostLink.style.display = 'inline-block';
}

// Cập nhật UI khi chưa đăng nhập
function updateUIForLoggedOut() {
    const authButtons = document.getElementById('authButtons');
    const userInfo = document.getElementById('userInfo');
    const postContainer = document.getElementById('postContainer');
    const profileLink = document.getElementById('profileLink');
    const addPostLink = document.getElementById('addPostLink');

    authButtons.style.display = 'flex';
    authButtons.innerHTML = `
        <a href="${baseUrl}/user/login.html" class="btn btn-login">Đăng nhập</a>
        <a href="${baseUrl}/user/register.html" class="btn btn-register">Đăng ký</a>
    `;
    userInfo.style.display = 'none';
    if (profileLink) profileLink.style.display = 'none';
    if (addPostLink) addPostLink.style.display = 'none';

    // Hiển thị thông báo yêu cầu đăng nhập
    postContainer.innerHTML = `
        <div class="login-prompt">
            <h2>Đăng nhập để xem bài đăng</h2>
            <p>Đăng nhập để xem ảnh và video từ bạn bè.</p>
            <div class="auth-buttons" style="justify-content: center;">
                <a href="${baseUrl}/user/login.html" class="btn btn-login">Đăng nhập</a>
                <a href="${baseUrl}/user/register.html" class="btn btn-register">Đăng ký</a>
            </div>
        </div>
    `;
}

// Lấy danh sách bài đăng
async function fetchPosts() {
    if (!isLoggedIn) {
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/api/posts`, {
            credentials: 'include'
        });

        if (response.status === 401) {
            isLoggedIn = false;
            updateUIForLoggedOut();
            return;
        }

        const posts = await response.json();

        const container = document.getElementById('postContainer');
        container.innerHTML = '';

        if (posts.length === 0) {
            container.innerHTML = '<div class="empty-state">Chưa có bài đăng nào.</div>';
            return;
        }

        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post-card';

            const username = post.username || 'User #' + post.user_id;
            const avatarInitial = username.charAt(0).toUpperCase();
            const timeAgo = getTimeAgo(new Date(post.created_at));

            const likeCount = typeof post.like_count === 'number' ? post.like_count : 0;
            const liked = !!post.liked_by_current_user;
            const likedClass = liked ? 'liked' : '';
            const likeLabel = liked ? '💖 Đã thả tim' : '🤍 Thả tim';

            postElement.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar">${avatarInitial}</div>
                    <div class="post-username">${username}</div>
                </div>
                ${post.image_url ? `<img src="${post.image_url}" alt="Post image" class="post-image">` : ''}
                <div class="post-content">
                    ${post.caption ? `
                        <div class="post-caption">
                            <span class="username">${username}</span>
                            ${post.caption}
                        </div>
                    ` : ''}
                    <div class="post-actions">
                        <button class="action-btn like-btn ${likedClass}" data-post-id="${post.id}">${likeLabel}</button>
                        <button class="action-btn comment-toggle-btn" data-post-id="${post.id}">💬 Bình luận</button>
                    </div>
                    <div class="likes-count" id="likes-count-${post.id}">${likeCount} lượt thích</div>
                    <div class="comment-section" id="comment-section-${post.id}">
                        <ul class="comment-list" id="comment-list-${post.id}"></ul>
                        <div class="comment-input-row">
                            <input type="text" placeholder="Viết bình luận..." id="comment-input-${post.id}">
                            <button type="button" class="comment-submit-btn" data-post-id="${post.id}">Gửi</button>
                        </div>
                    </div>
                    <div class="post-time">${timeAgo}</div>
                </div>
            `;
            container.appendChild(postElement);
            renderComments(post.id, getCommentsState(post.id));
        });
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu:", error);
        document.getElementById('postContainer').innerHTML = '<div class="empty-state" style="color: #ed4956;">Không thể kết nối với server.</div>';
    }
}

// Tính thời gian đã trôi qua
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} ngày trước`;
    if (hours > 0) return `${hours} giờ trước`;
    if (minutes > 0) return `${minutes} phút trước`;
    return 'Vừa xong';
}

function generateCommentId() {
    return 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getCommentsState(postId) {
    const raw = localStorage.getItem('comments_' + postId);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(c => ({
            id: c.id || generateCommentId(),
            text: c.text || '',
            likes: typeof c.likes === 'number' ? c.likes : 0,
            liked: !!c.liked
        }));
    } catch {
        return [];
    }
}

function setCommentsState(postId, comments) {
    localStorage.setItem('comments_' + postId, JSON.stringify(comments));
}

function renderComments(postId, comments) {
    const list = document.getElementById(`comment-list-${postId}`);
    if (!list) return;

    list.innerHTML = comments.map(comment => {
        const safeText = String(comment.text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const likeLabel = comment.liked ? '💖' : '🤍';
        return `
            <li data-comment-id="${comment.id}">
                <span>${safeText}</span>
                <button type="button" class="action-btn comment-like-btn" data-post-id="${postId}" data-comment-id="${comment.id}">
                    ${likeLabel} ${comment.likes}
                </button>
            </li>
        `;
    }).join('');
}

document.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    const commentToggleBtn = e.target.closest('.comment-toggle-btn');
    const commentSubmitBtn = e.target.closest('.comment-submit-btn');

    if (likeBtn) {
        const postId = likeBtn.getAttribute('data-post-id');

        try {
            likeBtn.disabled = true;
            likeBtn.style.cursor = 'wait';

            const response = await fetch(`${baseUrl}/api/posts/${postId}/like`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.status === 401) {
                isLoggedIn = false;
                updateUIForLoggedOut();
                return;
            }

            const data = await response.json();
            if (!response.ok || !data.success) {
                console.error('Lỗi tim bài viết:', data);
            } else {
                const liked = !!data.liked;
                const likeCount = typeof data.like_count === 'number' ? data.like_count : 0;

                const likesCountElem = document.getElementById(`likes-count-${postId}`);
                if (likesCountElem) likesCountElem.textContent = `${likeCount} lượt thích`;

                likeBtn.textContent = liked ? '💖 Đã thả tim' : '🤍 Thả tim';
            }
        } catch (err) {
            console.error('Lỗi kết nối khi tim:', err);
        } finally {
            likeBtn.disabled = false;
            likeBtn.style.cursor = 'pointer';
        }

        return;
    }

    const commentLikeBtn = e.target.closest('.comment-like-btn');
    if (commentLikeBtn) {
        const postId = commentLikeBtn.getAttribute('data-post-id');
        const commentId = commentLikeBtn.getAttribute('data-comment-id');
        const comments = getCommentsState(postId);
        const comment = comments.find(c => c.id === commentId);
        if (!comment) return;

        comment.liked = !comment.liked;
        comment.likes = comment.liked ? comment.likes + 1 : Math.max(0, comment.likes - 1);
        setCommentsState(postId, comments);
        renderComments(postId, comments);
        return;
    }

    if (commentToggleBtn) {
        const postId = commentToggleBtn.getAttribute('data-post-id');
        const section = document.getElementById(`comment-section-${postId}`);
        if (section) {
            section.style.display = section.style.display === 'block' ? 'none' : 'block';
            if (section.style.display === 'block') {
                renderComments(postId, getCommentsState(postId));
            }
        }
        return;
    }

    if (commentSubmitBtn) {
        const postId = commentSubmitBtn.getAttribute('data-post-id');
        const input = document.getElementById(`comment-input-${postId}`);
        if (!input || !input.value.trim()) return;

        const commentText = input.value.trim();
        const comments = getCommentsState(postId);
        const newComment = {
            id: generateCommentId(),
            text: commentText,
            likes: 0,
            liked: false
        };
        comments.push(newComment);
        setCommentsState(postId, comments);

        renderComments(postId, comments);

        input.value = '';

        return;
    }
});

// Xử lý đăng xuất
async function handleLogout() {
    try {
        const response = await fetch(`${baseUrl}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            isLoggedIn = false;
            currentUser = null;
            updateUIForLoggedOut();
        }
    } catch (error) {
        console.error("Lỗi khi đăng xuất:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();

    document.addEventListener('click', (e) => {
        if (e.target.id === 'logoutBtn') {
            handleLogout();
        }
    });
});
