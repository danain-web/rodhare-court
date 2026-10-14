-- =====================================================================
-- create_user.sql : สร้าง user ฐานข้อมูลสำหรับระบบ (รันครั้งเดียวบนเครื่องใหม่)
-- วิธีรัน: SQL Developer ล็อกอินด้วย system ต่อเข้า Service name XEPDB1 แล้วกด F5
-- จากนั้นล็อกอินด้วย rodhare / rodhare123 เพื่อรัน schema.sql -> constraints.sql -> seed.sql
-- =====================================================================

CREATE USER rodhare IDENTIFIED BY rodhare123
  DEFAULT TABLESPACE users
  QUOTA UNLIMITED ON users;

GRANT CONNECT, RESOURCE, CREATE VIEW, CREATE TRIGGER, CREATE PROCEDURE TO rodhare;
