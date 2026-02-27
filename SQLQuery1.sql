CREATE DATABASE newsFeedDb;
GO
USE newsFeedDb;
GO

CREATE TABLE Users
(
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    avatar VARCHAR(255) DEFAULT '/default.png',
    bio NVARCHAR(MAX),
    dob DATE,
    created_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE Posts
(
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT FOREIGN KEY REFERENCES Users(id),
    image_url VARCHAR(MAX),
    caption NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE Follows
(
    id INT IDENTITY(1,1) PRIMARY KEY,
    follower_id INT FOREIGN KEY REFERENCES Users(id),
    following_id INT FOREIGN KEY REFERENCES Users(id),
    UNIQUE(follower_id, following_id)
);
ALTER TABLE Posts
ALTER COLUMN image_url VARCHAR(MAX) NOT NULL;
GO

ALTER TABLE Users 
DROP CONSTRAINT DF__Users__avatar__38996AB5;
GO

ALTER TABLE Users
ALTER COLUMN avatar NVARCHAR(MAX);
GO

ALTER TABLE Users 
ADD CONSTRAINT DF_Users_Avatar_New
DEFAULT 'https://sp-ao.shortpixel.ai/client/to_webp,q_glossy,ret_img,w_1080,h_1080/https://hanoidep.vn/wp-content/uploads/2025/11/avatar-don-gian-3.webp' 
FOR avatar;
GO
