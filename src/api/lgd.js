import api from './client'
import {
  ACP_PROTOCOL_VERSION,
  simulateLocalAcpStream,
  streamLgdAcpTurn,
} from '../features/lgd/lgdAcpClient.js'

export { ACP_PROTOCOL_VERSION, simulateLocalAcpStream, streamLgdAcpTurn }

export function listRooms() {
  return api.get('/lgd/rooms').then((r) => r.data)
}

export function getRoom(roomId) {
  return api.get(`/lgd/rooms/${roomId}`).then((r) => r.data)
}

export function createRoom(payload) {
  return api.post('/lgd/rooms', payload).then((r) => r.data)
}

export function listTopics() {
  return api.get('/lgd/topics').then((r) => r.data)
}

export function scoreLgd(payload) {
  return api.post('/lgd/score', payload).then((r) => r.data)
}

export function listLgdScripts() {
  return api.get('/lgd/scripts').then((r) => r.data)
}

export function getLgdMemory() {
  return api.get('/lgd/memory').then((r) => r.data)
}

export function saveLgdMemory(payload) {
  return api.post('/lgd/memory', payload).then((r) => r.data)
}

export function requestLgdAgentTurn(payload) {
  return api.post('/lgd/agent-turn', payload).then((r) => r.data)
}

export function sendLgdRoomSignal(roomId, payload) {
  const safeRoom = encodeURIComponent(roomId || 'live')
  return api
    .post(`/lgd/rooms/${safeRoom}/signal`, payload, { skipErrorToast: true })
    .then((r) => r.data)
}

export function requestLgdBidding(roomId, payload) {
  const safeRoom = encodeURIComponent(roomId || 'live')
  return api
    .post(`/lgd/rooms/${safeRoom}/bidding`, payload, { skipErrorToast: true })
    .then((r) => r.data)
}

export function requestLgdObserverTag(payload) {
  return api
    .post('/lgd/observer-tag', payload, { skipErrorToast: true })
    .then((r) => r.data)
}

export function getLgdHandoffReport() {
  return api.get('/lgd/handoff', { skipErrorToast: true }).then((r) => r.data)
}

export function saveLgdHandoffReport(payload) {
  return api.post('/lgd/handoff', payload, { skipErrorToast: true }).then((r) => r.data)
}

