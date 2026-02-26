CREATE DATABASE newsFeedDb;
GO
USE newsFeedDb;
GO

CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    avatar VARCHAR(255) DEFAULT '/default.png',
    bio NVARCHAR(MAX),
    dob DATE,
    created_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE Posts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT FOREIGN KEY REFERENCES Users(id),
    image_url VARCHAR(255),
    caption NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE Follows (
    id INT IDENTITY(1,1) PRIMARY KEY,
    follower_id INT FOREIGN KEY REFERENCES Users(id),
    following_id INT FOREIGN KEY REFERENCES Users(id),
    UNIQUE(follower_id, following_id)
);



-- namthem
CREATE TABLE Messages (
    id INT IDENTITY(1,1) PRIMARY KEY,
    sender_id INT FOREIGN KEY REFERENCES Users(id),
    receiver_id INT FOREIGN KEY REFERENCES Users(id),
    message_text NVARCHAR(MAX),
    image_url VARCHAR(255),
    reply_to_id INT NULL, -- Lưu ID tin nhắn được reply
    is_read BIT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE()
);

-- Thêm bảng lưu Reaction
CREATE TABLE MessageReactions (
    message_id INT FOREIGN KEY REFERENCES Messages(id),
    user_id INT FOREIGN KEY REFERENCES Users(id),
    emoji NVARCHAR(10),
    PRIMARY KEY (message_id, user_id)
);

-- Bảng Conversation (hộp thoại) và thành viên
CREATE TABLE Conversations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    title NVARCHAR(200) NULL,
    last_message NVARCHAR(MAX) NULL,
    last_updated DATETIME DEFAULT GETDATE()
);

CREATE TABLE ConversationParticipants (
    id INT IDENTITY(1,1) PRIMARY KEY,
    conversation_id INT FOREIGN KEY REFERENCES Conversations(id),
    user_id INT FOREIGN KEY REFERENCES Users(id)
);

-- Mở rộng Messages để hỗ trợ conversation, seen và reaction text
IF COL_LENGTH('Messages', 'conversation_id') IS NULL
    ALTER TABLE Messages ADD conversation_id INT NULL;
IF COL_LENGTH('Messages', 'seen') IS NULL
    ALTER TABLE Messages ADD seen BIT DEFAULT 0;
IF COL_LENGTH('Messages', 'seen_at') IS NULL
    ALTER TABLE Messages ADD seen_at DATETIME NULL;
IF COL_LENGTH('Messages', 'reaction') IS NULL
    ALTER TABLE Messages ADD reaction NVARCHAR(50) NULL;
