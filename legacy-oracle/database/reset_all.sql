-- =====================================================================
-- reset_all.sql : ล้างฐานข้อมูลกลับเป็นข้อมูลตั้งต้น (เรียกจาก reset_demo.bat)
-- รัน schema -> constraints -> views -> seed ตามลำดับ แล้วตรวจว่าไม่มี object เสีย
-- =====================================================================
set echo off feedback off define off serveroutput on lines 200 pages 100 termout off
whenever sqlerror continue
@@schema.sql
@@constraints.sql
@@views.sql
@@seed.sql
set termout on feedback off heading off
prompt
prompt ===== RESULT =====
select 'Invalid objects : ' || count(*) from user_objects where status <> 'VALID';
select 'Users           : ' || count(*) from users;
select 'Courts          : ' || count(*) from courts;
select 'Bookings        : ' || count(*) from bookings;
select 'Audit triggers  : ' || count(*) from user_triggers where trigger_name like '%\_AUDIT' escape '\' and status = 'ENABLED';
prompt
prompt Compile errors (should be none):
select name || ' line ' || line || ': ' || text from user_errors order by name, sequence;
exit
