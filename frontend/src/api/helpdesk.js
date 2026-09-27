import client from './client';

/**
 * Employee Helpdesk API
 */
export function createTicket(data) {
  return client.post('/helpdesk/tickets', data);
}

export function getMyTickets() {
  return client.get('/helpdesk/my-tickets');
}

export function replyAsEmployee(ticketId, data) {
  return client.post(`/helpdesk/my-tickets/${ticketId}/replies`, data);
}

/**
 * Manager / Admin Helpdesk API
 */
export function getStaffTickets() {
  return client.get('/helpdesk/tickets');
}

export function getStaffTicketById(ticketId) {
  return client.get(`/helpdesk/tickets/${ticketId}`);
}

export function replyAsStaff(ticketId, data) {
  return client.post(`/helpdesk/tickets/${ticketId}/replies`, data);
}

export function updateTicketStatus(ticketId, data) {
  return client.put(`/helpdesk/tickets/${ticketId}/status`, data);
}
