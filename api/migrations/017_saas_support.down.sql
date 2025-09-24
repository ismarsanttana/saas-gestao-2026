DROP TRIGGER IF EXISTS trg_support_ticket_touch ON support_tickets;
DROP FUNCTION IF EXISTS update_support_ticket_timestamp();
DROP TABLE IF EXISTS support_ticket_messages;
DROP TABLE IF EXISTS support_tickets;
