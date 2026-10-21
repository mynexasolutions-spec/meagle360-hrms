import client from './client';

export const getGeofenceConfig = () => client.get('/geofence/config');
export const updateGeofenceConfig = (data) => client.put('/geofence/config', data);

export const createOffice = (data) => client.post('/geofence/offices', data);
export const updateOffice = (id, data) => client.put(`/geofence/offices/${id}`, data);
export const deleteOffice = (id) => client.delete(`/geofence/offices/${id}`);

export const getMyLocations = () => client.get('/geofence/my-locations');
export const requestMyLocation = (data) => client.post('/geofence/my-locations', data);
export const removeMyLocation = (id) => client.delete(`/geofence/my-locations/${id}`);

export const getLocationRequests = (params = {}) => client.get('/geofence/location-requests', { params });
export const reviewLocationRequest = (id, data) => client.post(`/geofence/location-requests/${id}/review`, data);

export const getFlaggedAttendance = (params = {}) => client.get('/geofence/flagged', { params });
export const reviewFlaggedAttendance = (id, data) => client.post(`/geofence/flagged/${id}/review`, data);
