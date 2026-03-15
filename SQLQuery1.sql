
CREATE TABLE Users
(
    id         INT IDENTITY(1,1) PRIMARY KEY,
    username   NVARCHAR(50),
    email      VARCHAR(100) UNIQUE,
    password   VARCHAR(255),
    avatar     NVARCHAR(MAX),
    bio        NVARCHAR(MAX),
    dob        DATE,
    last_seen  DATETIME NULL,
    created_at DATETIME DEFAULT GETDATE()
);
GO

ALTER TABLE Users
ADD CONSTRAINT DF_Users_Avatar_New
DEFAULT 'https://sp-ao.shortpixel.ai/client/to_webp,q_glossy,ret_img,w_1080,h_1080/https://hanoidep.vn/wp-content/uploads/2025/11/avatar-don-gian-3.webp'
FOR avatar;
GO

CREATE TABLE Posts
(
    id         INT IDENTITY(1,1) PRIMARY KEY,
    user_id    INT FOREIGN KEY REFERENCES Users(id),
    image_url  VARCHAR(MAX) NOT NULL,
    caption    NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE Follows
(
    id           INT IDENTITY(1,1) PRIMARY KEY,
    follower_id  INT FOREIGN KEY REFERENCES Users(id),
    following_id INT FOREIGN KEY REFERENCES Users(id),
    UNIQUE(follower_id, following_id)
);
GO

CREATE TABLE Likes
(
    id      INT IDENTITY(1,1) PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    CONSTRAINT FK_Likes_Posts     FOREIGN KEY (post_id) REFERENCES Posts(id),
    CONSTRAINT FK_Likes_Users     FOREIGN KEY (user_id) REFERENCES Users(id),
    CONSTRAINT UQ_Likes_Post_User UNIQUE (post_id, user_id)
);
GO

CREATE TABLE Comments
(
    id         INT IDENTITY(1,1) PRIMARY KEY,
    post_id    INT NOT NULL,
    user_id    INT NOT NULL,
    content    NVARCHAR(MAX) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Comments_Posts FOREIGN KEY (post_id) REFERENCES Posts(id),
    CONSTRAINT FK_Comments_Users FOREIGN KEY (user_id) REFERENCES Users(id)
);
GO

CREATE TABLE CommentLikes
(
    id         INT IDENTITY(1,1) PRIMARY KEY,
    comment_id INT NOT NULL,
    user_id    INT NOT NULL,
    CONSTRAINT FK_CommentLikes_Comments     FOREIGN KEY (comment_id) REFERENCES Comments(id),
    CONSTRAINT FK_CommentLikes_Users        FOREIGN KEY (user_id)    REFERENCES Users(id),
    CONSTRAINT UQ_CommentLikes_Comment_User UNIQUE (comment_id, user_id)
);
GO

CREATE TABLE Conversations
(
    id           INT IDENTITY(1,1) PRIMARY KEY,
    title        NVARCHAR(200) NULL,
    last_message NVARCHAR(MAX) NULL,
    last_updated DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE ConversationParticipants
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    conversation_id INT FOREIGN KEY REFERENCES Conversations(id),
    user_id         INT FOREIGN KEY REFERENCES Users(id)
);
GO

CREATE TABLE Messages
(
    id              INT IDENTITY(1,1) PRIMARY KEY,
    conversation_id INT NULL FOREIGN KEY REFERENCES Conversations(id),
    sender_id       INT FOREIGN KEY REFERENCES Users(id),
    receiver_id     INT FOREIGN KEY REFERENCES Users(id),
    message_text    NVARCHAR(MAX),
    image_url       VARCHAR(255),
    reply_to_id     INT NULL,
    seen            BIT DEFAULT 0,
    seen_at         DATETIME NULL,
    reaction        NVARCHAR(50) NULL,
    is_read         BIT DEFAULT 0,
    created_at      DATETIME DEFAULT GETDATE()
);
GO

CREATE TABLE MessageReactions
(
    message_id INT FOREIGN KEY REFERENCES Messages(id),
    user_id    INT FOREIGN KEY REFERENCES Users(id),
    emoji      NVARCHAR(10),
    PRIMARY KEY (message_id, user_id)
);
GO