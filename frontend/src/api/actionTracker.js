import client from './client';

export function getActionItems() {
  return client.get('/action-tracker/');
}

export function createActionItem(data) {
  return client.post('/action-tracker/', data);
}

export function updateActionItemStatus(itemId, data) {
  return client.patch(`/action-tracker/${itemId}/status`, data);
}

export function deleteActionItem(itemId) {
  return client.delete(`/action-tracker/${itemId}`);
}
