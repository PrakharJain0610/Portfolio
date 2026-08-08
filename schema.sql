-- Run this once against your MySQL server to create the database and table
-- used for user behaviour tracking.
--
--   mysql -u root -p < schema.sql
--
-- Then create/point a dedicated user at it and put those creds in .env.

CREATE DATABASE IF NOT EXISTS portfolio_tracking
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE portfolio_tracking;

-- One flat table holds every tracked event. Keeping a single table (instead
-- of separate page/section/project tables) keeps the schema beginner-friendly
-- while still letting us answer all the questions we care about via GROUP BY.
CREATE TABLE IF NOT EXISTS events (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id   VARCHAR(64)  NOT NULL,          -- random id stored in the visitor's browser (localStorage)
  event_type   VARCHAR(20)  NOT NULL,          -- 'pageview' | 'page_time' | 'section_time' | 'project_click' | 'project_time'
  page         VARCHAR(120) NOT NULL,          -- e.g. 'index.html'
  section      VARCHAR(120) NULL,              -- e.g. 'hero', 'skills', 'featured-projects'
  project_id   VARCHAR(120) NULL,              -- e.g. 'sales-dashboard'
  duration_ms  INT UNSIGNED NULL,              -- time spent, in milliseconds (NULL for simple 'pageview'/'project_click')
  user_agent   VARCHAR(255) NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_event_type (event_type),
  INDEX idx_page (page),
  INDEX idx_session (session_id)
) ENGINE=InnoDB;
