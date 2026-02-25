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